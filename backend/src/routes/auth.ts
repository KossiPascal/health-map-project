import express, { Request, Response } from 'express';
import jwt from "jsonwebtoken";
import axios from 'axios';
import { ENV } from "../config/env";
import { COUCH } from '../utils/db-utils';
import { CookieJar } from 'request';

const router = express.Router();
const { NODE_ENV, DHIS2_API_URL, JWT_SECRET, JWT_REFRESH_SECRET, DHIS2_ADMIN_USERNAMES, DHIS2_CAN_UPDATE_ORGUNIT_USERNAMES } = ENV;

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

async function fetchAllOrgUnits(headers: any, userOrgUnitIds: string[], options: FetchOptions = {}): Promise<OrgUnitResult> {
  const defaultOptions: FetchOptions = {
    includeDescendants: true,
    maxLevel: 5,
    flatten: false,
    asMap: false
  };

  options = { ...defaultOptions, ...options };

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

    const res = await axios.get(`${DHIS2_API_URL!.replace(/\/$/, '')}/organisationUnits.json`, {
      headers,
      params: {
        fields: 'id,name,level,parent[id,name],geometry,coordinates,path',
        paging: false,
        filter: filters
      }
    });

    const allUnits: OrgUnit[] = res.data?.organisationUnits
      .map(transformGeometry)
      .filter((unit: any) => !options.maxLevel || unit.level <= options.maxLevel);

    for (const unit of allUnits) {
      switch (unit.level) {
        case 1: orgUnits.Countries.push(unit); break;
        case 2: orgUnits.Regions.push(unit); break;
        case 3: orgUnits.Districts.push(unit); break;
        case 4: orgUnits.Communes.push(unit); break;
        case 5: orgUnits.HealthCenters.push(unit); break;
      }
    }

    let result: OrgUnitResult = orgUnits;

    if (options.flatten) result = allUnits;

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

    if (!JWT_SECRET || !JWT_REFRESH_SECRET) throw new Error('Env variables not defined!');

    // ################ START FOR COUCHDB USERS ################
    const userSession = await COUCH.memberUsersSession();
    if (!userSession) return res.status(401).json({ message: 'Invalid credentials' });
    const cookieJar: any = (COUCH.nano.config as any).cookieJar as CookieJar;
    if (!cookieJar?.jar || !Array.isArray(cookieJar.jar)) throw new Error('CookieJar mal initialisé ou vide.');
    const authSessionCookieJar = cookieJar.jar.find((cookie: any) => cookie.name === 'AuthSession');
    if (!authSessionCookieJar) throw new Error('CookieJar non initialisé. Assurez-vous que jar: true est bien activé dans nano.');
    const authSessionCookie = authSessionCookieJar.value?.split('=')[1];
    if (!authSessionCookie) return res.status(401).json({ error: 'No AuthSession cookie found' });
    // ################ END FOR COUCHDB USERS ################


    // ################ START FOR COUCHDB USERS ################
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Nom d'utilisateur et mot de passe requis" });
    const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");
    const headers = { Authorization: `Basic ${basicAuth}`, Accept: "application/json" };
    const userRes = await fetch(`${DHIS2_API_URL}/me`, { headers });
    if (!userRes.ok) return res.status(401).json({ message: "Échec de l'authentification DHIS2" });
    const user = await userRes.json();
    if (!user || !user.organisationUnits?.length) return res.status(403).json({ message: "Utilisateur sans unités organisationnelles" });
    // ################ END FOR DHIS2 USERS ################


    const userOrgUnitIds = user.organisationUnits.map((ou: any) => ou.id);
    const orgUnits = await fetchAllOrgUnits(headers, userOrgUnitIds, { includeDescendants: true, maxLevel: 5 });
    const founcdUsername = user.username || user.name || username;
    const isAdmin = DHIS2_ADMIN_USERNAMES.includes(founcdUsername);
    const canUpdateDhis2Data = DHIS2_CAN_UPDATE_ORGUNIT_USERNAMES.includes(founcdUsername);
    const token = jwt.sign({ id: user.id, username: founcdUsername, isAdmin, canUpdateDhis2Data, basicAuth }, JWT_SECRET, { expiresIn: "180d" });
    const refreshToken = jwt.sign({ sub: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
    const userData = { id: user.id, username: founcdUsername, isAdmin, canUpdateDhis2Data };
    const days180 = 24 * 60 * 60 * 1000 * 180;// 180 jours

    res.cookie('AuthSession', authSessionCookie, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: days180,
    });
    res.cookie("TogoMapToken", token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: days180,
    });
    res.cookie('TogoMapRefreshToken', refreshToken, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: days180 - 60_000,
    });
    res.cookie('TogoMapUserCtx', JSON.stringify(userData), {
      httpOnly: false,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: days180,
    });

    return res.status(200).json({ orgUnits });
  } catch (err: any) {
    console.error("Erreur de login:", err);
    return res.status(500).json({ error: err.message || "Erreur serveur lors de la connexion" });
  }
});

router.post("/refresh_token", async (req: Request, res: Response) => {
  const token = req.cookies['TogoMapRefreshToken'];
  if (!token) return res.sendStatus(401);

  try {
    const payload: any = jwt.verify(token, JWT_REFRESH_SECRET!);
    return res.status(200).json({ ok: true, userId: payload.sub });
  } catch {
    return res.sendStatus(403);
  }
});

// 🔓 Déconnexion
router.post("/logout", (req, res) => {
  try {
    res.clearCookie('TogoMapToken', {
      httpOnly: true,
      sameSite: 'strict',
      secure: NODE_ENV === 'production',
    });
    res.clearCookie('TogoMapRefreshToken', {
      httpOnly: true,
      sameSite: 'strict',
      secure: NODE_ENV === 'production',
    });
    res.clearCookie('AuthSession', {
      path: '/',
      sameSite: 'strict',
      secure: NODE_ENV === 'production',
    });
    res.clearCookie('TogoMapUserCtx', {
      httpOnly: false,
      sameSite: 'strict',
      secure: NODE_ENV === 'production',
    });

    return res.status(200).json({ ok: true, message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Logout failed' });
  }
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