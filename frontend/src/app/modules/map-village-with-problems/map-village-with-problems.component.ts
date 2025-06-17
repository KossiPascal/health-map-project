import { Component, OnInit, OnDestroy } from "@angular/core";
import { NgForm } from "@angular/forms";
import { ChwMap } from "@kossi-models/interfaces";
import { DbService } from "@kossi-services/db.service";
import { findSimilarRecords } from "@kossi-src/app/shares/functions";


@Component({
    standalone: false,
    selector: 'app-map-viewer',
    templateUrl: './map-village-with-problems.component.html',
    styleUrls: ['./map-village-with-problems.component.css'],
})
export class MapVillageWithProblemsComponent implements OnInit, OnDestroy {

    showUpdateModal: boolean = false;
    selectedChw: ChwMap | undefined;
    message: string = '';
    isSavingProccess: boolean = false;

    problemVillageList: { [key: string]: { a: ChwMap; b: ChwMap; reason: string }[] } | undefined;



    // ascList: ChwMap[] = [];

    constructor(private db: DbService) { }

    async ngOnInit(): Promise<void> {
        this.initializeApp();
    }

    async initializeApp() {
        this.problemVillageList = undefined;
        try {
            const ascList = await this.db.getAllDocs('chw') as ChwMap[];
            const listByFs: { [key: string]: any[] } = {};

            for (const asc of ascList) {
                const fsId = asc.healthCenter.id;
                if (fsId) {
                    if (!(fsId in listByFs)) {
                        listByFs[fsId] = [];
                    }
                    listByFs[fsId].push({ ...asc, parentId: asc.healthCenter.id, villageName: asc.village.names ?? [] })
                }
            }

            for (const [key, value] of Object.entries(listByFs)) {
                const matches = findSimilarRecords<ChwMap>(value, 'villageName', 'parentId', 0.9);
                if (matches.length > 0) {
                    if (!this.problemVillageList) {
                        this.problemVillageList = {};
                    }
                    if (!(key in this.problemVillageList)) {
                        this.problemVillageList[key] = [];
                    }
                    this.problemVillageList[key] = matches;
                }
            }
        } catch (err) {
            console.error('Erreur lors du chargement des ASC:', err);
            alert('Erreur lors du chargement des données des ASC.');
        }
    }

    selectData(data: ChwMap) {
        this.selectedChw = data;
        if (!this.selectedChw.village.names) {
            this.selectedChw.village.names = ['']
        }
        this.showUpdateModal = true;
    }

    async updateData(form: NgForm) {
        this.message = ''
        if (!this.selectedChw) return;

        if (form.invalid) {
            this.message = 'Le formulaire contient des erreurs.';
            return;
        }
        this.isSavingProccess = true;

        const res = await this.db.createOrUpdateDoc(this.selectedChw, 'chw');

        if (res) {
            this.selectedChw = undefined;
            await this.initializeApp();
            this.showUpdateModal = false;
            this.message = 'Modifié avec succès';
        } else {
            this.message = 'Erreur lors de la modification du nom';
        }
        this.isSavingProccess = false;

    }

    addVillageName(): void {
        if (!this.selectedChw) return;
        if (!this.selectedChw.village.names) {
            this.selectedChw.village.names = ['']
        }
        this.selectedChw.village.names.push('');
    }

    removeVillageName(index: number): void {
        if (!this.selectedChw) return;
        if (this.selectedChw.village.names.length > 1) {
            this.selectedChw.village.names.splice(index, 1);
        }
    }


    trackByIndex(index: number, item: string): any {
        return index;
    }

    async deleteData(data: ChwMap) {
        if (!data || !data._id || !data._rev) return;
        if (confirm('confirmez-vous la suppression de cette selection?')) {
            await this.db.deleteDoc({ _id: data._id, _rev: data._rev });
            await this.initializeApp();
        }
    }

    async deleteAll(data: { a: ChwMap; b: ChwMap; reason: string; }) {
        if (!data.a || !data.a._id || !data.a._rev || !data.b || !data.b._id || !data.b._rev) return;
        if (confirm('confirmez-vous la suppression de ces 2 enrégistrement ?')) {
            await this.db.deleteDoc({ _id: data.a._id, _rev: data.a._rev });
            await this.db.deleteDoc({ _id: data.b._id, _rev: data.b._rev });
            await this.initializeApp();
        }
    }


    ngOnDestroy(): void {
    }

    MergerData(data: { a: ChwMap; b: ChwMap; reason: string; }) {
        throw new Error('Method not implemented.');
    }



}
