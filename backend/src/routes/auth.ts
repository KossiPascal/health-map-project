import express from "express";
import jwt from "jsonwebtoken";
import axios from 'axios';
import { ENV } from "../config/env";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();
const { DHIS2_API_URL, JWT_SECRET, DHIS2_ADMIN_USERNAMES } = ENV;

interface OrgUnit {
  id: string;
  level: number;
  name: string
  parent?: {
    id: string;
    name: string
  },
  geometry?: {
    type: string; // "Point", "Polygon", etc.
    coordinates: number[] | number[][]; // [lng, lat] ou [[...]]
  };
  lat?: number;
  lng?: number;
}

interface OrgUnitOutPut {
  Countries: OrgUnit[];
  Regions: OrgUnit[];
  Districts: OrgUnit[];
  Communes: OrgUnit[];
  HealthCenters: OrgUnit[];
}

interface FetchOptions {
  includeDescendants?: boolean;  // défaut: true
  maxLevel?: number;             // limite la profondeur (ex: 3 = jusqu’au District)
  flatten?: boolean;             // retourne une liste au lieu de groupé par niveau
  asMap?: boolean;               // retourne un Map<string, OrgUnit>
}

type OrgUnitResult = OrgUnitOutPut | OrgUnit[] | Map<string, OrgUnit>;

const orgUnitCache = new Map<string, OrgUnit[]>();


function transformGeometry(unit: any): OrgUnit {
  let lat: number | undefined;
  let lng: number | undefined;
  let geometry: OrgUnit['geometry'] | undefined;

  try {
    // Cas 1 : GeoJSON classique
    if (unit.geometry?.type === 'Point' && Array.isArray(unit.geometry.coordinates)) {
      [lng, lat] = unit.geometry.coordinates as [number, number];
      geometry = { type: 'Point', coordinates: [lng, lat] };

      // Cas 2 : coordonnées à plat (souvent dans DHIS2)
    } else if (Array.isArray(unit.coordinates) && unit.coordinates.length === 2) {
      [lng, lat] = unit.coordinates as [number, number];;
      geometry = { type: 'Point', coordinates: [lng, lat] };

      // Fallback (éventuellement)
    } else {
      // console.warn('[transformGeometry] Format de géométrie inconnu:', unit);
    }

    return {
      id: unit.id ?? '',
      name: unit.name ?? '',
      level: parseInt(unit.level ?? '0', 10),
      parent: unit.parent ? { id: unit.parent.id ?? '', name: unit.parent.name ?? '' } : undefined,
      geometry,
      lat,
      lng
    };
  } catch (error) {
    // console.error('[transformGeometry] Erreur de transformation:', error, unit);
    return {
      id: unit.id ?? '',
      name: unit.name ?? '',
      level: parseInt(unit.level ?? '0', 10),
      geometry: undefined,
      lat: undefined,
      lng: undefined
    };
  }
}

async function fetchAllOrgUnits(headers: any, userOrgUnitIds: string[], options: FetchOptions = { includeDescendants: true }): Promise<OrgUnitResult> {
  const key = JSON.stringify({ ids: userOrgUnitIds.sort(), ...options });
  if (orgUnitCache.has(key)) {
    return orgUnitCache.get(key)!;
  }

  const orgUnits: OrgUnitOutPut = {
    Countries: [],
    Regions: [],
    Districts: [],
    Communes: [],
    HealthCenters: []
  };

  try {
    const filters: string[] = [];

    if (options.includeDescendants !== false) {
      filters.push(...userOrgUnitIds.map(id => `path:like:${id}`));
    } else {
      filters.push(`parent.id:in:[${userOrgUnitIds.join(',')}]`);
    }

    const res = await axios.get(`${DHIS2_API_URL}/organisationUnits.json`, {
      headers,
      params: {
        fields: 'id,name,level,parent[id,name],geometry,coordinates,path',
        paging: false,
        filter: filters
      }
    });

    const allUnits: OrgUnit[] = res.data?.organisationUnits
      .map(transformGeometry)
      .filter((unit: OrgUnit) => {
        if (options.maxLevel && unit.level > options.maxLevel) return false;
        return true;
      });

    for (const unit of allUnits) {
      switch (unit.level) {
        case 1: orgUnits.Countries.push(unit); break;
        case 2: orgUnits.Regions.push(unit); break;
        case 3: orgUnits.Districts.push(unit); break;
        case 4: orgUnits.Communes.push(unit); break;
        case 5: orgUnits.HealthCenters.push(unit); break;
        default: break;
      }
    }

    let result: OrgUnitResult = orgUnits;

    if (options.flatten) {
      result = allUnits;
    }

    if (options.asMap) {
      const map = new Map<string, OrgUnit>();
      for (const unit of allUnits) map.set(unit.id, unit);
      result = map;
    }

    orgUnitCache.set(key, result as any);
    return result;
  } catch (error: any) {
    console.error('[fetchAllOrgUnits] Erreur:', error.message || error);
    throw new Error('Erreur lors du chargement des unités organisationnelles.');
  }
}

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Nom d'utilisateur et mot de passe requis" });
    }
    const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");
    const headers = {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json"
    };

    // const response = await axios.get(`${DHIS2_API_URL}/api/me`, { headers: { Authorization: `Basic ${basicAuth}` } });
    // const user = response.data;

    // 🔒 Requête DHIS2 pour récupérer l'utilisateur
    const userRes = await fetch(`${DHIS2_API_URL}/me`, { headers });
    if (!userRes.ok) {
      return res.status(401).json({ message: "Échec de l'authentification DHIS2" });
    }
    const user = await userRes.json();
    // 🔒 Vérification : l'utilisateur existe et a des unités
    if (!user || !user.organisationUnits?.length) {
      return res.status(403).json({ message: "Utilisateur sans unités organisationnelles" });
    }

    const userOrgUnitIds = user.organisationUnits.map((ou: any) => ou.id);

    // 🔹 Structure par niveau, descendants récursifs, max niveau 3
    const orgUnitsByLevel = await fetchAllOrgUnits(headers, userOrgUnitIds, {
      includeDescendants: true,
      maxLevel: 5
    });

    // // 🔹 Résultat à plat
    // const flatList = await fetchAllOrgUnits(headers, userOrgUnitIds, { flatten: true });
    // // 🔹 Résultat en Map
    // const unitMap = await fetchAllOrgUnits(headers, userOrgUnitIds, { asMap: true });
    // const region = unitMap.get('A1r42Id3'); // accès direct

    const isAdmin = DHIS2_ADMIN_USERNAMES.includes(user.username || user.name);

    // 🔐🧾 Création du token JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username || user.name,
        isAdmin,
        basicAuth: basicAuth,
        // roles: user.userCredentials.userRoles.map((r: any) => r.id),
        // autorisations: user.userCredentials.userAuthorityGroups,
        // isAdmin: user.userCredentials.authorities.includes('ALL'),
        // orgUnits
      },
      JWT_SECRET!,
      { expiresIn: "1d" }
    );

    // 🍪 Envoi du token en cookie httpOnly
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000 // 1 jour
    });
    // 🟢 Réponse client
    return res.json({ token, id: user.id, username: user.username, isAdmin, orgUnits: orgUnitsByLevel });

  } catch (err) {
    // console.error("Erreur de login:", err);
    return res.status(500).json({ message: "Erreur serveur lors de la connexion" });
  }
});

// 🔓 Déconnexion
router.post("/logout", authMiddleware, (req, res) => {
  res.clearCookie("token");
  return res.json({ message: "Déconnecté" });
});

export = router;


















// // 🔄 Récupération des unités organisationnelles complètes
// const orgUnits: any[] = [];
// for (const ou of user.organisationUnits) {
//   const unitWithChildren = await getOrgUnitWithChildren(ou.id, headers);
//   orgUnits.push(unitWithChildren);
// }


// 🔄 Récupération des unités organisationnelles complètes
// const orgUnitIds = user.organisationUnits.map((ou: any) => ou.id);
// const orgUnits: any[] = await getUserFullOrgUnits(orgUnitIds, headers);


// // 📦 Collecte aplatie de toutes les unités
// let allUnits: any[] = [];
// const visited = new Set<string>();
// for (const ou of user.organisationUnits) {
//   await collectOrgUnits(ou.id, headers, allUnits, visited);
// }
// // 🧹 Suppression des doublons par id
// const seen = new Set();
// const orgUnits: any[] = allUnits.filter(unit => {
//   if (seen.has(unit.id)) return false;
//   seen.add(unit.id);
//   return true;
// });
// // 📊 Tri par niveau
// orgUnits.sort((a, b) => a.level - b.level);



// 🔁 Fonction récursive pour récupérer les enfants
async function getOrgUnitWithChildren(id: string, headers: any): Promise<any> {
  const res = await fetch(`${DHIS2_API_URL}/organisationUnits/${id}?fields=id,name,level,parent[id,name],coordinates,children[id]`, { headers });
  if (!res.ok) throw new Error(`Erreur récupération unité ${id}`);
  const unit = await res.json();

  const childrenIds = (unit.children || []).map((c: any) => c.id);
  const children: any[] = [];

  for (const childId of childrenIds) {
    const childUnit = await getOrgUnitWithChildren(childId, headers);
    children.push(childUnit);
  }

  unit.children = children;
  return unit;
}


async function getUserFullOrgUnits(orgUnitIds: string[], headers: any): Promise<any> {
  // 🔄 Récupération des unités organisationnelles complètes
  const orgUnitIdsToGet = orgUnitIds.join(",");
  const orgUnitUrl = `${DHIS2_API_URL}/organisationUnits?filter=id:in:[${orgUnitIds}]&fields=id,name,level,parent[id,name],coordinates`;
  const orgUnitsRes = await fetch(orgUnitUrl, { headers });

  if (!orgUnitsRes.ok) throw new Error(`Erreur lors de la récupération des unités`);

  const orgUnitsJson = await orgUnitsRes.json();
  const orgUnits = orgUnitsJson.organisationUnits || [];

  return orgUnits
}

// 🔁 Fonction récursive qui aplatit toutes les unités enfants
async function collectOrgUnits(id: string, headers: any, collected: any[] = [], visited: Set<string> = new Set()): Promise<any[]> {

  if (visited.has(id)) return collected; // 🔁 Évite les boucles infinies
  visited.add(id);

  const res = await fetch(`${DHIS2_API_URL}/organisationUnits/${id}?fields=id,name,level,parent[id,name],coordinates,children[id]`, { headers });
  if (!res.ok) throw new Error(`Erreur récupération unité ${id}`);

  const unit = await res.json();
  collected.push({
    id: unit.id,
    name: unit.name,
    level: unit.level,
    parent: unit.parent || null,
    coordinates: unit.coordinates || null
  });

  for (const child of unit.children || []) {
    await collectOrgUnits(child.id, headers, collected, visited);
  }

  return collected;
}