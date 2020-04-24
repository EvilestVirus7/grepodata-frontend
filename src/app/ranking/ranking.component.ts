import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {WorldService} from "../services/world.service";
import {RankingService} from "./ranking.service";
import {ActivatedRoute, Router} from "@angular/router";
import { PageEvent } from "@angular/material/paginator";
import {Globals} from '../globals';

@Component({
  selector: 'app-ranking',
  templateUrl: './ranking.component.html',
  styleUrls: ['./ranking.component.scss'],
  providers: [RankingService, WorldService]
})
export class RankingComponent implements OnInit {
  // API data
  results = [];
  count = 0;
  worldData = '';

  // Form vars
  server: any = 'nl';
  serverDisplayed = 'nl';
  world: any = '';
  type = 'player';
  sort_field = 'Points';
  sort_order = 'desc';
  from = 0;
  size = 30;
  pageIndex = 0;
  highlightId = 0;
  fromResult = this.from;
  worldName = '';
  servers = [];
  worlds = [];
  disableScrollTo = false;
  loading = false;
  error = false;
  pageEvent: PageEvent;

  constructor(private globals: Globals,
              private rankingService: RankingService,
              private worldService: WorldService,
              private router: Router,
              private route: ActivatedRoute) {
    this.server = worldService.getDefaultServer();

    // Load scoreboard using params. if no params are supplied, they will be generated by backend
    this.route.params.subscribe( params => this.load(params));

    this.worldService.getWorlds().then((response) => this.loadWorlds(response));
  }

  ngOnInit() {}

  paginatorEvent($event) {
    this.pageEvent = $event;
    if (typeof this.pageEvent != 'undefined') {
      this.disableScrollTo = true;
      this.pageIndex = this.pageEvent.pageIndex;
      this.from = this.pageEvent.pageIndex * this.pageEvent.pageSize;
      this.size = this.pageEvent.pageSize;
      this.load([]);
    }
  }

  load(params) {
    // Save params
    if (typeof params['type'] != 'undefined') this.type = params['type'];
    if (typeof params['sort'] == 'string') {
    	switch (params['sort']) {
				case 'attack':
					this.sort_field = 'Att';
					break;
				case 'defence':
					this.sort_field = 'Def';
					break;
				case 'fight':
					this.sort_field = 'AttDef';
					break;
				default:
					this.sort_field = 'Points';
			}
		}
    if (typeof params['world'] != 'undefined') {
      this.world = params['world'];
      this.server = this.world.substr(0,2);
      this.globals.set_active_world(this.world);
      this.globals.set_active_server(this.server);
    } else if (this.server != '' && this.world != '' && this.server != this.world.substr(0,2)) {
      this.world = '';
    } else if (this.globals.get_active_world() !== false) {
      this.world = this.globals.get_active_world();
      this.server = this.world.substr(0,2);
    }

    if (typeof params['offset'] != 'undefined') {
      this.pageIndex = Math.floor(params['offset']/this.size);
      this.from = Math.max(0, params['offset'] - (params['offset'] % this.size));
    }

    if (typeof params['highlight'] != 'undefined') {
      this.highlightId = params['highlight'];
    }

    this.loading = true;
    if (this.type == 'player') {
      this.rankingService.loadPlayerRanking(this.world, this.sort_field, this.sort_order, this.from, this.size, this.server)
        .subscribe(
          (response) => this.renderRankingResults(response),
          (error) => console.log(error)
        );
    } else {
      this.rankingService.loadAllianceRanking(this.world, this.sort_field, this.sort_order, this.from, this.size, this.server)
        .subscribe(
          (response) => this.renderRankingResults(response),
          (error) => console.log(error)
        );
    }
  }

  setType(type) {
    this.from = 0;
    this.pageIndex = 0;
    this.highlightId = 0;
    this.type = type;
    this.load([]);
  }

  sort(field) {
    this.from = 0;
    this.pageIndex = 0;
    if(this.sort_field == field) {
      // Toggle sort
      if (this.sort_order == 'asc') this.sort_order = 'desc';
      else this.sort_order = 'asc'
    } else {
      this.sort_field = field;
      this.sort_order = 'desc';
      if (this.sort_field == 'Rank') this.sort_order = 'asc';
    }

    // Reload
    this.load([]);
  }

  loadWorlds(worldData) {
    this.worldData = worldData;
    this.servers = [];
    this.worlds = [];
    for (let i of this.worldData) {
      this.servers.push((<any>i).server);
      if ((<any>i).server == this.server) {
				if (this.world == '') {
					this.world = (<any>i).worlds[0].id;
					this.globals.set_active_world(this.world);
					this.globals.set_active_server(this.world.substr(0,2));
				}
        for (let w of (<any>i).worlds) {
          this.worlds.push(w);
          if (w.id == this.world) this.worldName = w.name;
        }
      }
    }
  }

  setWorld(event) {
    this.globals.set_active_world(event);
    this.globals.set_active_server(event.substr(0,2));
    this.router.navigate(['/ranking/'+event]);
  }

  updateWorlds(event) {
    this.server = event;
		this.world = '';
    this.loadWorlds(this.worldData);
    this.load([]);
  }

  renderRankingResults(json) {
    if (json.failed && json.failed == true) {
      this.error = true;
    } else {
      this.world = json.world;
      this.globals.set_active_world(this.world);
      this.globals.set_active_server(this.world.substr(0,2));
			this.fromResult = this.from;
      this.results = json.results;
      if (this.count != json.count) this.count = json.count;
      this.serverDisplayed = this.server;
      this.fromResult = this.from;

      this.loadWorlds(this.worldData);
    }
    this.loading = false;

    if (this.highlightId > 0 && this.disableScrollTo == false) {
      setTimeout(() => {
        console.log("scrolling");
        document.getElementById("highlightRow").scrollIntoView({ behavior: "smooth", block: "end" });
      }, 50);
    }
  }

}
