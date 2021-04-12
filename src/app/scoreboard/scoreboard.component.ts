import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    ElementRef,
    HostListener,
    Inject,
    OnInit,
    Renderer2,
    TemplateRef,
    ViewChild,
} from '@angular/core';
import { ScoreboardService } from './scoreboard.service';
import { LocalCacheService } from '../services/local-cache.service';
import { WorldService } from '../services/world.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { GoogleAnalyticsEventsService } from '../services/google-analytics-events.service';
import { Globals } from '../globals';
import { SearchService } from '../search/search.service';
import { ConquestService } from '../conquest/conquest.service';
import { environment } from '../../environments/environment';

@Component({
    selector: 'app-scoreboard',
    templateUrl: './scoreboard.component.html',
    styleUrls: ['./scoreboard.component.scss'],
    providers: [ScoreboardService, LocalCacheService, WorldService, SearchService, ConquestService],
})
export class ScoreboardComponent implements OnInit {
    @ViewChild('searchPlayerOff', { static: false, read: ElementRef }) searchPlayerOff: ElementRef;
    @ViewChild('searchPlayerDef', { static: false, read: ElementRef }) searchPlayerDef: ElementRef;
    @ViewChild('overviewContainer', { static: false }) overviewContainer: ElementRef;
    @ViewChild('worldMap', { static: false }) worldMap: ElementRef;
    @ViewChild('worldMapContainer', { static: false }) worldMapContainer: ElementRef;
    @ViewChild('mapTooltipContainer', { static: false }) mapTooltipContainer: ElementRef;
    @ViewChild('mapTip', { static: false }) mapTip: ElementRef;

    // API data
    playerData = '' as any;
    playerDiffs = '' as any;
    allianceData = '' as any;
    allianceChangesData = [] as any;
    data_default: any[];
    worldData = '' as any;

    // Form vars
    server: any = 'nl'; // TODO: dynamic default??
    world: any = ''; // TODO: dynamic default??
    worldName = '';
    nextUpdate = '';
    playerInput = '';
    searchResults = [];
    servers = [];
    worlds = [];
    loadingPlayers = false;
    loadingDiffs = true;
    loadingAlliances = false;
    noAllianceData = false;
    noPlayerData = false;
    toggleMore = true;
    hasOverview = true;
    searching = false;
    searchInputting = false;
    mobile = false;
    noticePlayer = '';
    noticeAlliance = '';

    // Datepicker
    minDate = '';
    maxDate = new Date();
    selectedDate = new Date();
    scoreboardDateInfo = '';

    // Debounce
    typingTimer;
    debounceTime = 400;
    usedInput: any;

    // Map
    showMap = false;
    showTodaysMap = false;
    animated = false;
    mapCanvas: any = null;
    legend: any = {};
    tipTimer;
    tipTimout = 3000;
    maxZoom = 8;
    minZoom = 0;
    currentZoom = 1;
    zoomOriginX = 0;
    zoomOriginY = 0;

    env = environment;
    constructor(
        private globals: Globals,
        private scoreboardService: ScoreboardService,
        private conquestService: ConquestService,
        private searchService: SearchService,
        private worldService: WorldService,
        private router: Router,
        private route: ActivatedRoute,
        public dialog: MatDialog,
        private renderer: Renderer2
    ) {
        if (window.screen.width < 560) {
            // 768px portrait
            this.mobile = true;
            this.debounceTime = 750;
        }

        // Object.assign(this, {data_default});ve

        this.server = worldService.getDefaultServer();

        let noQueryParams = false;
        let noRouteParams = false;

        // Load scoreboard using params. if no params are supplied, they will be generated by backend
        this.route.queryParams.subscribe((params) => {
            if (params.world != undefined || noRouteParams) {
                this.load(params);
            } else {
                noQueryParams = true;
            }
        });

        this.route.params.subscribe((params) => {
            if (params.world != undefined && params.date != undefined) {
                this.router.navigate(['/points'], { queryParams: { world: params.world, date: params.date } });
            } else if (params.world != undefined) {
                this.router.navigate(['/points'], { queryParams: { world: params.world } });
            } else {
                noRouteParams = true;
                if (noQueryParams) {
                    this.load(params);
                }
            }
        });

        this.worldService.getWorlds().then((response) => this.loadWorlds(response));
    }

    ngOnInit() {}

    @HostListener('window:resize', ['$event'])
    onResize(event) {
        this.clearTip();
        this.buildCanvas();
    }

    setInputValue(val) {
        this.playerInput = val;
        if (this.searchPlayerOff) this.searchPlayerOff.nativeElement.value = val;
        if (this.searchPlayerDef) this.searchPlayerDef.nativeElement.value = val;
    }

    clearSearch() {
        this.setInputValue('');
        this.searchResults = [];
    }

    filterKeyup($event) {
        if (typeof $event != 'undefined') {
            this.searchInputting = true;
            this.usedInput = $event.target;
            this.setInputValue($event.target.value);
        }

        clearTimeout(this.typingTimer);
        let that = this;
        this.typingTimer = setTimeout(function () {
            that.filterEvent();
        }, this.debounceTime);
    }

    filterEvent() {
        this.searchInputting = false;
        if (this.playerInput.length > 2) {
            this.searching = true;
            this.searchService
                .searchPlayers(this.playerInput, 0, 7, this.server, this.world, false, null, null, true, '')
                .subscribe(
                    (response) => this.renderSearchResults(response),
                    (error) => {
                        this.searchResults = [];
                        this.searching = false;
                        if (this.usedInput) {
                            setTimeout(() => this.usedInput.focus(), 0);
                        }
                    }
                );
        }
    }

    renderSearchResults(response) {
        if (response.success == true) {
            this.searchResults = response.results;
        } else {
            this.searchResults = [];
        }

        let that = this;
        this.searchResults.forEach(function (i) {
            Object.keys(that.playerData.att).forEach(function (j) {
                if (that.playerData.att[j].i == i.id) {
                    i.att_rank_scoreboard = +j + 1;
                }
            });
            Object.keys(that.playerData.def).forEach(function (j) {
                if (that.playerData.def[j].i == i.id) {
                    i.def_rank_scoreboard = +j + 1;
                }
            });
        });

        this.searching = false;
        if (this.usedInput) {
            setTimeout(() => this.usedInput.focus(), 10);
        }
    }

    refresh() {
        if (this.loadingPlayers) return;
        let params = { world: this.world };
        this.load(params);
    }

    animate(animated: boolean) {
        this.animated = animated;
        if (this.animated && this.showMap) {
            this.mapCanvas = null;
            let url = this.env.url + '/m/' + this.world + '/animated.gif';
            if (!this.env.production) {
                url = '../../assets/images/m/animated.gif';
            }
            this.worldMap.nativeElement.setAttribute('src', url);
        } else {
            this.reloadMap();
        }
        this.mapZoom(null, -100); // reset zoom
    }

    mapNav(event, modX, modY) {
        const mod = 40 - this.currentZoom * 3;
        this.zoomOriginX += modX * mod;
        this.zoomOriginY += modY * mod;
        this.renderer.setStyle(
            this.worldMapContainer.nativeElement,
            'transform-origin',
            this.zoomOriginX + 'px ' + this.zoomOriginY + 'px'
        );
        this.buildCanvas();
    }

    mapZoom(event, mod) {
        this.currentZoom += mod;
        if (this.currentZoom < this.minZoom) {
            this.currentZoom = this.minZoom;
        } else if (this.currentZoom > this.maxZoom) {
            this.currentZoom = this.maxZoom;
        }
        if (this.currentZoom == 0) {
            this.resetMapPivot();
        }

        //zoom
        let zoom = 1 + 0.4 * this.currentZoom;
        if (this.currentZoom == 1) {
            zoom = 1.5;
        }
        this.renderer.setStyle(this.worldMapContainer.nativeElement, 'transform', 'scale(' + zoom + ')');
        if (zoom > 1) {
            this.renderer.setStyle(
                this.worldMapContainer.nativeElement,
                'transform-origin',
                this.zoomOriginX + 'px ' + this.zoomOriginY + 'px'
            );
        }
    }

    dragStartJs(event) {
        event.preventDefault();
        let img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
        event.dataTransfer.setDragImage(img, 0, 0);
    }

    mapTooltip(event) {
        if (this.mapCanvas != null && !this.mobile && !this.animated) {
            let pixelData = this.mapCanvas.getContext('2d').getImageData(event.offsetX, event.offsetY, 1, 1).data;
            // console.log(pixelData);
            let colorId = pixelData.toString().replace(/,/g, '');
            let match = null;
            Object.keys(this.legend).forEach((k) => {
                if (k === colorId) {
                    match = k;
                } else {
                    let colorDistance =
                        Math.abs(pixelData[0] - this.legend[k].pixel[0]) +
                        Math.abs(pixelData[1] - this.legend[k].pixel[1]) +
                        Math.abs(pixelData[2] - this.legend[k].pixel[2]);
                    if (colorDistance <= 5) {
                        match = k;
                    }
                    // else {
                    // console.log("===");
                    // console.log(colorDistance);
                    // console.log(pixelData);
                    // console.log(this.legend[k]);
                    // }
                }
            });
            if (match != null) {
                let legendData = this.legend[match];
                // Create tooltip
                this.renderer.setStyle(
                    this.mapTip.nativeElement,
                    'background',
                    'url(' +
                        this.worldMap.nativeElement.src +
                        ') -' +
                        legendData.namex +
                        'px -' +
                        legendData.namey +
                        'px no-repeat'
                );
                this.renderer.setStyle(this.mapTooltipContainer.nativeElement, 'top', event.clientY - 30 + 'px');
                this.renderer.setStyle(this.mapTooltipContainer.nativeElement, 'left', event.clientX + 5 + 'px');
                this.renderer.setStyle(this.mapTooltipContainer.nativeElement, 'display', 'block');

                // Hide after a while
                clearTimeout(this.tipTimer);
                let that = this;
                this.tipTimer = setTimeout(function () {
                    that.renderer.setStyle(that.mapTooltipContainer.nativeElement, 'display', 'none');
                }, this.tipTimout);
            } else {
                this.renderer.setStyle(this.mapTooltipContainer.nativeElement, 'display', 'none');
            }
        }
    }

    clearTip() {
        if (!this.mobile && this.mapTooltipContainer) {
            this.renderer.setStyle(this.mapTooltipContainer.nativeElement, 'display', 'none');
        }
    }

    load(params) {
        // Save params
        // if (typeof params['date'] != 'undefined') {
        //   this.paramsDate = params['date'];
        // }
        if (typeof params['world'] != 'undefined') {
            this.world = params['world'];
            this.server = this.world.substr(0, 2);
            this.globals.set_active_world(this.world);
            this.globals.set_active_server(this.server);
        } else if (this.server != '' && this.world != '' && this.server != this.world.substr(0, 2)) {
            this.world = '';
        } else if (this.globals.get_active_world() != false) {
            this.world = this.globals.get_active_world();
            this.server = this.world.substr(0, 2);
        }

        this.loadingPlayers = true;
        this.loadingDiffs = true;
        this.playerDiffs = '';
        this.searchResults = [];
        this.searching = false;
        // this.hasOverview = false;
        this.showMap = false;
        this.showTodaysMap = false;
        this.animated = false;
        this.currentZoom = 0;
        this.zoomOriginX = null;
        this.zoomOriginY = null;
        this.setInputValue('');
        this.scoreboardService.loadPlayerScoreboard(this.world, params['date'], this.server).subscribe(
            (response) => this.renderPlayerScoreboard(response, params['date']),
            (error) => this.renderPlayerScoreboard(null, params['date'])
        );

        this.loadingAlliances = true;
        this.scoreboardService.loadAllianceScoreboard(this.world, params['date'], this.server).subscribe(
            (response) => this.renderAllianceScoreboard(response, params['date']),
            (error) => this.renderAllianceScoreboard(null, params['date'])
        );

        this.scoreboardService.loadAllianceChanges(this.world, params['date'], this.server, 0, 22).subscribe(
            (response) => this.renderAllianceChanges(response, params['date']),
            (error) => this.renderAllianceChanges(null, params['date'])
        );
    }

    loadWorlds(worldData) {
        this.worldData = worldData;
        this.servers = [];
        this.worlds = [];
        for (let i of this.worldData) {
            this.servers.push((<any>i).server);
            if ((<any>i).server == this.server) {
                for (let w of (<any>i).worlds) {
                    this.worlds.push(w);
                    if (w.id == this.world) this.worldName = w.name;
                }
            }
        }

        // Cache data
        // LocalCacheService.set('worlds', json);
    }

    setWorld(event) {
        this.globals.set_active_world(event);
        this.globals.set_active_server(event.substr(0, 2));
        if (this.nextUpdate == '') {
            this.router.navigate(['/points'], { queryParams: { world: event, date: this.selectedDate.toString() } });
        } else {
            this.router.navigate(['/points'], { queryParams: { world: event } });
        }
    }
    setDate(event) {
        let dateString =
            event.getFullYear() +
            '-' +
            ('0' + (event.getMonth() + 1)).slice(-2) +
            '-' +
            ('0' + event.getDate()).slice(-2);
        this.router.navigate(['/points'], { queryParams: { world: this.world, date: dateString } });
    }
    prevDay() {
        if (this.loadingPlayers) return;
        let today = new Date(this.selectedDate);
        let tomorrow = new Date(this.selectedDate);
        tomorrow.setDate(today.getDate() - 1);
        let dateString =
            tomorrow.getFullYear() +
            '-' +
            ('0' + (tomorrow.getMonth() + 1)).slice(-2) +
            '-' +
            ('0' + tomorrow.getDate()).slice(-2);
        this.router.navigate(['/points'], { queryParams: { world: this.world, date: dateString } });
    }
    nextDay() {
        if (this.loadingPlayers) return;
        let today = new Date(this.selectedDate);
        let tomorrow = new Date(this.selectedDate);
        tomorrow.setDate(today.getDate() + 1);
        let dateString =
            tomorrow.getFullYear() +
            '-' +
            ('0' + (tomorrow.getMonth() + 1)).slice(-2) +
            '-' +
            ('0' + tomorrow.getDate()).slice(-2);
        this.router.navigate(['/points'], { queryParams: { world: this.world, date: dateString } });
    }
    today() {
        if (this.loadingPlayers) return;
        this.router.navigate(['/points'], { queryParams: { world: this.world } });
    }

    updateWorlds(event) {
        this.server = event;
        this.loadWorlds(this.worldData);
        this.load([]);
    }

    renderPlayerScoreboard(json, date) {
        if (json == null) {
            this.noticePlayer = 'We found no player scoreboard for ' + this.world + ' on ' + date;
            this.noPlayerData = true;
        } else {
            // Check response date
            if (date != undefined && date != json.date)
                this.noticePlayer =
                    'Unable to find player scoreboard for ' +
                    this.world +
                    ' on ' +
                    date +
                    "; showing today's scoreboard instead.";
            else this.noticePlayer = '';

            // Update scoreboard form and data
            this.playerData = json;
            // console.log(json.overview);
            this.data_default = json.overview;
            this.minDate = json.minDate;
            this.selectedDate = json.date;
            this.world = json.world;
            this.server = json.world.substring(0, 2);
            this.globals.set_active_world(this.world);
            this.globals.set_active_server(this.server);

            if ('date' in json) {
                let date = new Date(json.date);
                let limit = new Date();
                limit.setMonth(limit.getMonth() - 1);
                this.hasOverview = limit <= date;
                let mapLim = new Date('2020-01-13');
                this.showMap = date >= mapLim;
            } else {
                this.hasOverview = false;
                this.showMap = false;
            }

            // Date status
            if (json.allowCache == false) {
                // Today!
                this.scoreboardDateInfo = 'today before ' + json.time;
                if (!json.nextUpdate.includes('after')) {
                    this.nextUpdate = 'Next update expected in ' + json.nextUpdate;
                } else {
                    this.nextUpdate = 'Next update imminent';
                }

                if (this.showMap) {
                    this.showTodaysMap = true;
                    // let today = new Date(this.selectedDate);
                    // let utcMapTime = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 6));
                    // if (new Date() < utcMapTime) {
                    // 	console.log("Map for today is not yet available");
                    // 	console.log(utcMapTime);
                    // 	this.showMap = false;
                    // }
                }

                this.loadPlayerDiffs();
            } else {
                this.scoreboardDateInfo = 'on ' + json.date;
                this.nextUpdate = '';
                this.showTodaysMap = false;
            }

            this.loadWorlds(this.worldData);
        }
        this.loadingPlayers = false;

        this.reloadMap();
    }

    reloadMap() {
        console.log('Reloading map');
        setTimeout((_) => {
            if (this.showMap && this.worldMap && !this.mobile) {
                this.mapCanvas = null;

                let url =
                    this.env.url +
                    '/m/' +
                    this.world +
                    '/map_' +
                    this.selectedDate.toString().replace(/-/g, '_') +
                    '.png';
                if (this.env.production) {
                    if (this.showTodaysMap) {
                        url = this.env.url + '/m/' + this.world + '/map_today.png';
                    }
                } else {
                    url = '../../assets/images/m/map_2020_01_13.png';
                }

                this.worldMap.nativeElement.setAttribute('src', url);
                this.worldMap.nativeElement.style.display = 'block';
            }
        }, 100);
    }

    resetMapPivot() {
        console.log('resetting map pivot');
        let pivot = this.worldMap.nativeElement.height / 2;
        this.zoomOriginX = pivot;
        this.zoomOriginY = pivot;
    }

    buildCanvas() {
        if (!this.mobile && !this.animated) {
            // Check initial origin
            if (this.zoomOriginX == null) {
                this.resetMapPivot();
            }

            // Build canvas
            console.log('Building map canvas');
            let canvas = document.createElement('canvas');
            canvas.width = this.worldMap.nativeElement.width;
            canvas.height = this.worldMap.nativeElement.height;
            canvas
                .getContext('2d')
                .drawImage(
                    this.worldMap.nativeElement,
                    0,
                    0,
                    this.worldMap.nativeElement.width,
                    this.worldMap.nativeElement.height
                );
            this.mapCanvas = canvas;

            // Build color legend
            let canvasTemp = document.createElement('canvas');
            canvasTemp.width = 1250;
            canvasTemp.height = 1000;
            canvasTemp.getContext('2d').drawImage(this.worldMap.nativeElement, 0, 0, 1250, 1000);

            let offset = 90;
            let legend = {};
            let i = 0;
            while (i < 30) {
                i++;
                let pixelData = canvasTemp.getContext('2d').getImageData(1015, offset, 1, 1).data;
                let colorId = pixelData.toString().replace(/,/g, '');
                if (colorId == '0000') {
                    // end of legend
                    i = 30;
                } else {
                    legend[colorId] = {
                        namex: 1070,
                        namey: offset - 11,
                        pixel: pixelData,
                    };
                }
                offset += 20;
            }
            this.legend = legend;
        }
    }

    onOverviewSelect(event) {
        if (this.hasOverview) {
            this.openOverviewdialog(event.series);
        }
    }

    openPlayerOverview(id, name) {
        this.openPlayerOverviewdialog(id, name);
    }

    openAllianceOverview(id, name) {
        this.openAllianceOverviewdialog(id, name);
    }

    loadPlayerDiffs() {
        this.scoreboardService.loadPlayerDiffs(this.world).subscribe(
            (response) => {
                this.playerDiffs = response;
                this.loadingDiffs = false;
            },
            (error) => {
                this.loadingDiffs = true;
            }
        );
    }

    renderAllianceScoreboard(json, date) {
        if (json == null) {
            this.noticeAlliance = 'We found no alliance scoreboard for ' + this.world + ' on ' + date;
            this.allianceData = '';
            this.noAllianceData = true;
        } else {
            if (date != undefined && date != json.date)
                this.noticeAlliance =
                    'Unable to find alliance scoreboard for ' +
                    this.world +
                    ' on ' +
                    date +
                    '; showing ' +
                    json.date +
                    ' instead.';
            else this.noticeAlliance = '';
            this.allianceData = json;
            this.noAllianceData = false;
        }
        this.loadingAlliances = false;
    }

    renderAllianceChanges(json, date) {
        if (json == null || json.items == undefined) {
            this.allianceChangesData = '';
        } else {
            this.allianceChangesData = json.items;
        }
    }

    public openBBdialog(type) {
        let dataBB = {
            data: {},
            world: this.world,
            worldName: this.worldName,
            date: this.selectedDate,
            dateInfo: this.scoreboardDateInfo,
        };
        if (type == 'players_att') {
            dataBB.data = this.playerData.att;
        } else if (type == 'players_def') {
            dataBB.data = this.playerData.def;
        } else if (type == 'players_con') {
            dataBB.data = this.playerData.con;
        } else if (type == 'players_los') {
            dataBB.data = this.playerData.los;
        } else if (type == 'alliances_att') {
            dataBB.data = this.allianceData.att;
        } else if (type == 'alliances_def') {
            dataBB.data = this.allianceData.def;
        } else if (type == 'alliances_con') {
            dataBB.data = this.allianceData.con;
        } else if (type == 'alliances_los') {
            dataBB.data = this.allianceData.los;
        } else {
            return false;
        }

        let dialogRef = this.dialog.open(BBScoreboardDialog, {
            // width: '90%',
            // height: '80%',
            autoFocus: false,
            data: {
                dataBB: dataBB,
                type: type,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {});
    }

    public openOverviewdialog(hour) {
        let dialogRef = this.dialog.open(OverviewDialog, {
            // width: '90%',
            // height: '80%',
            autoFocus: false,
            data: {
                world: this.world,
                date: this.selectedDate.toString(),
                hour: hour,
            },
        });
        dialogRef.afterClosed().subscribe((result) => {});
    }

    public openPlayerOverviewdialog(id, name) {
        let dialogRef = this.dialog.open(PlayerOverviewDialog, {
            // width: '80%',
            // height: '70%',
            autoFocus: false,
            data: {
                world: this.world,
                date: this.selectedDate.toString(),
                id: id,
                name: name,
            },
        });
        dialogRef.afterClosed().subscribe((result) => {});
    }

    public openAllianceOverviewdialog(id, name) {
        let dialogRef = this.dialog.open(AllianceOverviewDialog, {
            // width: '80%',
            // height: '70%',
            autoFocus: false,
            data: {
                world: this.world,
                date: this.selectedDate.toString(),
                id: id,
                name: name,
            },
        });
        dialogRef.afterClosed().subscribe((result) => {});
    }

    showConquests(type, id, name) {
        this.conquestService.showConquestDialog(type, id, name, this.world, this.selectedDate);
    }
}

@Component({
    selector: 'bb-scoreboard-dialog',
    templateUrl: 'bb.html',
    providers: [],
})
export class BBScoreboardDialog {
    type: any;
    typeDisplay: any;
    typeBB: any;
    dataBB: any;
    generated_at: any;
    copied = false;
    slider: any = 10;

    constructor(
        public dialogRef: MatDialogRef<BBScoreboardDialog>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        public googleAnalyticsEventsService: GoogleAnalyticsEventsService
    ) {
        this.type = data.type;

        if (
            this.type == 'players_att' ||
            this.type == 'players_def' ||
            this.type == 'players_con' ||
            this.type == 'players_los'
        ) {
            this.typeDisplay = 'Player';
            this.typeBB = 'player';
        } else if (
            this.type == 'alliances_att' ||
            this.type == 'alliances_def' ||
            this.type == 'alliances_con' ||
            this.type == 'alliances_los'
        ) {
            this.typeDisplay = 'Alliance';
            this.typeBB = 'ally';
            this.slider = 15;
        }

        this.dataBB = data.dataBB;
        this.generated_at = new Date().toLocaleString();

        try {
            this.googleAnalyticsEventsService.emitEvent('BB_scoreboard', 'copyBBscore', 'copyBBscore', 1);
        } catch (e) {}
    }

    onNoClick(): void {
        this.dialogRef.close();
    }

    copyBB() {
        let selection = window.getSelection();
        let txt = document.getElementById('bb_code');
        let range = document.createRange();
        range.selectNodeContents(txt);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy');
        selection.removeAllRanges();
        this.copied = true;
    }
}

@Component({
    selector: 'overview-dialog',
    templateUrl: 'overview.html',
    styleUrls: ['./scoreboard.component.scss'],
    providers: [ScoreboardService],
})
export class OverviewDialog implements AfterViewInit {
    world;
    date;
    hour;
    hourRaw;
    hourStart;
    data;

    error;
    loading = false;

    constructor(
        private cdr: ChangeDetectorRef,
        private router: Router,
        public dialogRef: MatDialogRef<OverviewDialog>,
        @Inject(MAT_DIALOG_DATA) public dialogData: any,
        private scoreboardService: ScoreboardService,
        public dialog: MatDialog
    ) {
        this.world = dialogData.world;
        this.date = dialogData.date;
        this.hourRaw = dialogData.hour;
        this.hour = this.hourRaw.replace(':00', '').replace(/^0+/, '');
        this.hourStart = (this.hour < 10 ? '0' : '') + (this.hour - 1) + ':00';

        this.loading = true;
        this.scoreboardService.loadHourDiffs(this.world, this.date, this.hour).subscribe(
            (response) => this.renderResults(response),
            (error) => {
                console.log(error);
                this.error = true;
                this.loading = false;
            }
        );
    }

    onNoClick(): void {
        this.dialogRef.close();
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    ngAfterViewInit() {
        this.cdr.detach();
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    onDefSelect(event) {
        let player = this.data.def.filter((obj) => obj.name === event.name);
        this.dialogRef.close('navigate');
        this.openPlayerOverviewdialog(player[0].id, event.name);
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    onAttSelect(event) {
        let player = this.data.att.filter((obj) => obj.name === event.name);
        this.dialogRef.close('navigate');
        this.openPlayerOverviewdialog(player[0].id, event.name);
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    public openPlayerOverviewdialog(id, name) {
        let dialogRef = this.dialog.open(PlayerOverviewDialog, {
            autoFocus: false,
            data: {
                world: this.world,
                date: this.date,
                id: id,
                name: name,
            },
        });
        dialogRef.afterClosed().subscribe((result) => {});
    }

    renderResults(json) {
        this.data = json;
        this.loading = false;
        //console.log(json);
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }
}

@Component({
    selector: 'player-overview-dialog',
    templateUrl: 'player-overview.html',
    styleUrls: ['./scoreboard.component.scss'],
    providers: [ScoreboardService],
})
export class PlayerOverviewDialog implements AfterViewInit {
    world;
    date;
    player_id;
    player_name;
    hourRaw;
    hourStart;
    data;

    error;
    loading = false;

    constructor(
        private cdr: ChangeDetectorRef,
        private router: Router,
        public dialogRef: MatDialogRef<PlayerOverviewDialog>,
        @Inject(MAT_DIALOG_DATA) public dialogData: any,
        private scoreboardService: ScoreboardService,
        public dialog: MatDialog
    ) {
        this.world = dialogData.world;
        this.date = dialogData.date;
        this.player_id = dialogData.id;
        this.player_name = dialogData.name;

        this.loading = true;
        this.scoreboardService.loadDayDiffs(this.world, this.date, this.player_id).subscribe(
            (response) => this.renderResults(response),
            (error) => {
                console.log(error);
                this.error = true;
                this.loading = false;
            }
        );
    }

    onNoClick(): void {
        this.dialogRef.close();
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    ngAfterViewInit() {
        this.cdr.detach();
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    public openOverviewDialog(hour) {
        let dialogRef = this.dialog.open(OverviewDialog, {
            // width: '90%',
            // height: '80%',
            autoFocus: false,
            data: {
                world: this.world,
                date: this.date,
                hour: hour,
            },
        });
        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'navigate') {
                this.onNoClick();
                this.cdr.detectChanges();
                setTimeout((_) => this.cdr.detectChanges(), 250);
            }
        });
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    onSelect(event) {
        let hour = event.series;
        this.dialogRef.close('navigate');
        this.openOverviewDialog(hour);
    }

    renderResults(json) {
        this.data = json;
        this.loading = false;
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }
}

@Component({
    selector: 'alliance-overview-dialog',
    templateUrl: 'alliance-overview.html',
    styleUrls: ['./scoreboard.component.scss'],
    providers: [ScoreboardService],
})
export class AllianceOverviewDialog implements AfterViewInit {
    world;
    date;
    alliance_id;
    alliance_name;
    hourRaw;
    hourStart;
    data;

    error;
    loading = false;

    constructor(
        private cdr: ChangeDetectorRef,
        private router: Router,
        public dialogRef: MatDialogRef<AllianceOverviewDialog>,
        @Inject(MAT_DIALOG_DATA) public dialogData: any,
        private scoreboardService: ScoreboardService,
        public dialog: MatDialog
    ) {
        this.world = dialogData.world;
        this.date = dialogData.date;
        this.alliance_id = dialogData.id;
        this.alliance_name = dialogData.name;

        this.loading = true;
        this.scoreboardService.loadAllianceDayDiffs(this.world, this.date, this.alliance_id).subscribe(
            (response) => this.renderResults(response),
            (error) => {
                console.log(error);
                this.error = true;
                this.loading = false;
            }
        );
    }

    onNoClick(): void {
        this.dialogRef.close();
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    ngAfterViewInit() {
        this.cdr.detach();
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }

    public openPlayerOverviewdialog(id, name) {
        let dialogRef = this.dialog.open(PlayerOverviewDialog, {
            autoFocus: false,
            data: {
                world: this.world,
                date: this.date,
                id: id,
                name: name,
            },
        });
        dialogRef.afterClosed().subscribe((result) => {});
    }

    onSelect(event) {
        let player = this.data.filter((obj) => obj.name === event.series)[0];
        this.dialogRef.close('navigate');
        this.openPlayerOverviewdialog(player.id, player.name);
    }

    renderResults(json) {
        this.data = json;
        this.loading = false;
        this.cdr.detectChanges();
        setTimeout((_) => this.cdr.detectChanges(), 250);
    }
}
