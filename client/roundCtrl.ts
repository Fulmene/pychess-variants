import Sockette from 'sockette';

import { init } from 'snabbdom';
import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

import { Role, Key, SetPremoveMetadata } from 'chessgroundx/types';

import { _ } from './i18n';
import { Clock } from './clock';
import { GameController, Step } from './gameCtrl';
import { sound } from './sound';
import { uci2cg, cg2uci, getPockets, getCounting, dropIsValid  } from './chess';
import { crosstableView } from './crosstable';
import { chatMessage, chatView } from './chat';
import { renderRdiff } from './profile'
import { player } from './player';
import { updateCount, updatePoint } from './info';

const patch = init([klass, attributes, properties, listeners]);

export default class RoundController extends GameController {
    profileId: string;
    byoyomi: boolean;
    byoyomiPeriod: number;
    clocks: [Clock, Clock];
    clocktimes;

    abortable: boolean;
    vmiscInfoW: VNode;
    vmiscInfoB: VNode;
    vpng: VNode;
    tv: boolean;
    blindfold: boolean;
    handicap: boolean;
    autoqueen: boolean;
    setupFen: string;

    constructor(el, model) {
        super(el, model);

        const onOpen = (evt) => {
            console.log("ctrl.onOpen()", evt);
            this.clocks[0].connecting = false;
            this.clocks[1].connecting = false;
            this.doSend({ type: "game_user_connected", username: this.username, gameId: this.gameId });
        };

        const opts = {
            maxAttempts: 10,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => {
                this.clocks[0].connecting = true;
                this.clocks[1].connecting = true;
                console.log('Reconnecting in round...', e);

                const container = document.getElementById('player1') as HTMLElement;
                patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
            },
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => console.log('Closed!', e),
            onerror: e => console.log('Error:', e),
        };

        const ws = location.host.includes('pychess') ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/wsr", opts);

        this.profileId = model.profileid;
        this.byoyomiPeriod = Number(model.byo);
        this.byoyomi = this.variant.timeControl === 'byoyomi';
        this.tv = model.tv;

        const parts = this.fullfen.split(" ");

        this.abortable = Number(parts[parts.length - 1]) <= 1;

        this.chessground.set({
            autoCastle: this.variant.name !== 'cambodian', // TODO make more generic
        });

        if (!this.spectator) {
            this.chessground.set({
                movable: {
                    color: this.mycolor,
                    events: {
                        after: (orig, dest, meta) => this.onUserMove(orig, dest, meta),
                        afterNewPiece: (role, key, meta) => this.onUserDrop(role, key, meta),
                    },
                },
                draggable: {
                    enabled: true,
                },
                premovable: {
                    enabled: true,
                    events: {
                        set: (orig, dest, meta) => this.setPremove(orig, dest, meta),
                        unset: () => this.unsetPremove(),
                    },
                },
                predroppable: {
                    enabled: true,
                    events: {
                        set: (role, key) => this.setPredrop(role, key),
                        unset: () => this.unsetPredrop(),
                    },
                },
                events: {
                    move: (orig, dest, capturedPiece) => this.onMove(orig, dest, capturedPiece),
                    dropNewPiece: (piece, key) => this.onDrop(piece, key),
                    select: (key) => this.onSelect(key),
                },
            });
        }

        // initialize users
        const player0 = document.getElementById('rplayer0') as HTMLElement;
        const player1 = document.getElementById('rplayer1') as HTMLElement;
        this.vplayer0 = patch(player0, player('player0', this.titles[0], this.players[0], this.ratings[0], model["level"]));
        this.vplayer1 = patch(player1, player('player1', this.titles[1], this.players[1], this.ratings[1], model["level"]));

        // initialize clocks
        this.clocktimes = {};
        const c0 = new Clock(this.base, this.inc, this.byoyomiPeriod, document.getElementById('clock0') as HTMLElement, 'clock0');
        const c1 = new Clock(this.base, this.inc, this.byoyomiPeriod, document.getElementById('clock1') as HTMLElement, 'clock1');
        this.clocks = [c0, c1];
        this.clocks[0].onTick(this.clocks[0].renderTime);
        this.clocks[1].onTick(this.clocks[1].renderTime);

        const onMoreTime = () => {
            // TODO: enable when this.flip is true
            if (this.titles.includes('BOT') || this.spectator || this.status >= 0 || this.flip) return;
            this.clocks[0].setTime(this.clocks[0].duration + 15 * 1000);
            this.doSend({ type: "moretime", gameId: this.gameId });
            const oppName = (this.username === this.wplayer) ? this.bplayer : this.wplayer;
            chatMessage('', oppName + _(' +15 seconds'), "roundchat");
        }

        // more time button
        if (!this.spectator && model.rated !== '1' && !this.titles.includes('BOT')) {
            const container = document.getElementById('more-time') as HTMLElement;
            patch(container, h('div#more-time', h('button.icon.icon-plus-square', {
                props: { type: "button", title: _("Give 15 seconds") },
                on: { click: () => onMoreTime() }
            })));
        }

        const misc0 = document.getElementById('misc-info0') as HTMLElement;
        const misc1 = document.getElementById('misc-info1') as HTMLElement;

        // initialize material point and counting indicator
        this.vmiscInfoW = this.mycolor === 'white' ? patch(misc1, h('div#misc-infow')) : patch(misc0, h('div#misc-infow'));
        this.vmiscInfoB = this.mycolor === 'black' ? patch(misc1, h('div#misc-infob')) : patch(misc0, h('div#misc-infob'));

        const flagCallback = () => {
            if (this.turnColor === this.mycolor) {
                this.chessground.stop();
                // console.log("Flag");
                this.doSend({ type: "flag", gameId: this.gameId });
            }
        }

        const byoyomiCallback = () => {
            if (this.turnColor === this.mycolor) {
                // console.log("Byoyomi", this.clocks[1].byoyomiPeriod);
                const oppclock = !this.flip ? 0 : 1;
                const myclock = 1 - oppclock;
                this.doSend({ type: "byoyomi", gameId: this.gameId, color: this.mycolor, period: this.clocks[myclock].byoyomiPeriod });
            }
        }

        if (!this.spectator) {
            if (this.byoyomiPeriod > 0) {
                this.clocks[1].onByoyomi(byoyomiCallback);
            }
            this.clocks[1].onFlag(flagCallback);
        }

        const container = document.getElementById('game-controls') as HTMLElement;
        if (!this.spectator) {
            const pass = this.variant.pass;
            this.gameControls = patch(container, h('div.btn-controls', [
                h('button#abort', { on: { click: () => this.abort() }, props: { title: _('Abort') } }, h('i.icon.icon-abort')),
                h('button#count', _('Count')), // TODO use icon
                h('button#draw', { on: { click: () => pass ? this.pass() : this.draw() }, props: { title: pass ? _('Pass') : _("Draw")} }, pass ? _('Pass') : h('i', '½')), // TODO use icon for pass
                h('button#resign', { on: { click: () => this.resign() }, props: { title: _("Resign") }}, h('i.icon.icon-flag-o')),
            ]));

            const manualCount = this.variant.counting === 'makruk' && !this.titles.includes('BOT');
            if (!manualCount)
                patch(document.getElementById('count') as HTMLElement, h('div'));

        } else {
            this.gameControls = patch(container, h('div.btn-controls'));
        }

        patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));
    }

    toggleOrientation() {
        super.toggleOrientation();

        // TODO: moretime button

        const new_running_clck = (this.clocks[0].running) ? this.clocks[1] : this.clocks[0];
        this.clocks[0].pause(false);
        this.clocks[1].pause(false);

        const tmp_clock = this.clocks[0];
        const tmp_clock_time = tmp_clock.duration;
        this.clocks[0].setTime(this.clocks[1].duration);
        this.clocks[1].setTime(tmp_clock_time);
        if (this.status < 0) new_running_clck.start();

        this.vplayer0 = patch(this.vplayer0, player('player0', this.titles[this.flip ? 1 : 0], this.players[this.flip ? 1 : 0], this.ratings[this.flip ? 1 : 0], this.aiLevel));
        this.vplayer1 = patch(this.vplayer1, player('player1', this.titles[this.flip ? 0 : 1], this.players[this.flip ? 0 : 1], this.ratings[this.flip ? 0 : 1], this.aiLevel));

        if (this.variant.counting)
            [this.vmiscInfoW, this.vmiscInfoB] = updateCount(this.fullfen, this.vmiscInfoB, this.vmiscInfoW);

        if (this.variant.materialPoint)
            [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(this.fullfen, this.vmiscInfoB, this.vmiscInfoW);
    }

    private abort() {
        // console.log("Abort");
        this.doSend({ type: "abort", gameId: this.gameId });
    }

    private draw() {
        // console.log("Draw");
        this.doSend({ type: "draw", gameId: this.gameId });
    }

    private resign() {
        // console.log("Resign");
        if (confirm(_('Are you sure you want to resign?'))) {
            this.doSend({ type: "resign", gameId: this.gameId });
        }
    }

    private rematch() {
        this.doSend({ type: "rematch", gameId: this.gameId, handicap: this.handicap });
    }

    private newOpponent() {
        this.doSend({"type": "leave", "gameId": this.gameId});
        window.location.assign(this.home);
    }

    private analysis() {
        window.location.assign(this.home + '/' + this.gameId + '?ply=' + this.ply.toString());
    }

    // Janggi horses and elephants setup
    private onMsgSetup(msg) {
        this.setupFen = msg.fen;
        this.chessground.set({ fen: this.setupFen });

        const side = (msg.color === 'white') ? _('Blue (Cho)') : _('Red (Han)');
        const message = _('Waiting for %1 to choose starting positions of the horses and elephants...', side);

        chatMessage('', message, "roundchat");

        if (this.spectator || msg.color !== this.mycolor) return;

        const switchLetters = (side) => {
            const white = this.mycolor === 'white';
            const rank = (white) ? 9 : 0;
            const horse = (white) ? 'N' : 'n';
            const elephant = (white) ? 'B' : 'b';
            const parts = this.setupFen.split(' ')[0].split('/');
            let [left, right] = parts[rank].split('1')
            if (side === -1)
                left = left.replace(horse, '*').replace(elephant, horse).replace('*', elephant);
            else
                right = right.replace(horse, '*').replace(elephant, horse).replace('*', elephant);
            parts[rank] = left + '1' + right;
            this.setupFen = parts.join('/') + ' w - - 0 1' ;
            this.chessground.set({ fen: this.setupFen });
        }

        const sendSetup = () => {
            patch(document.getElementById('janggi-setup-buttons') as HTMLElement, h('div#empty'));
            this.doSend({ type: "setup", gameId: this.gameId, color: this.mycolor, fen: this.setupFen });
        }

        const leftSide = (this.mycolor === 'white') ? -1 : 1;
        const rightSide = leftSide * -1;
        patch(document.getElementById('janggi-setup-buttons') as HTMLElement, h('div#janggi-setup-buttons', [
            h('button#flipLeft', { on: { click: () => switchLetters(leftSide) } }, [h('i', {props: {title: _('Switch pieces')}, class: {"icon": true, "icon-exchange": true} } ), ]),
            h('button', { on: { click: () => sendSetup() } }, [h('i', {props: {title: _('Ready')}, class: {"icon": true, "icon-check": true} } ), ]),
            h('button#flipRight', { on: { click: () => switchLetters(rightSide) } }, [h('i', {props: {title: _('Switch pieces')}, class: {"icon": true, "icon-exchange": true} } ), ]),
        ]));
    }

    private gameOver(rdiffs) {
        let container;
        container = document.getElementById('wrdiff') as HTMLElement;
        patch(container, renderRdiff(rdiffs.wrdiff));

        container = document.getElementById('brdiff') as HTMLElement;
        patch(container, renderRdiff(rdiffs.brdiff));

        // console.log(rdiffs)
        this.gameControls = patch(this.gameControls, h('div'));
        let buttons: VNode[] = [];
        if (!this.spectator) {
            buttons.push(h('button.rematch', { on: { click: this.rematch } }, _("REMATCH")));
            buttons.push(h('button.newopp', { on: { click: this.newOpponent } }, _("NEW OPPONENT")));
        }
        buttons.push(h('button.analysis', { on: { click: this.analysis } }, _("ANALYSIS BOARD")));
        patch(this.gameControls, h('div.btn-controls.after', buttons));
    }

    private checkStatus(msg) {
        if (msg.gameId !== this.gameId) return;
        if (msg.status >= 0) {
            this.status = msg.status;
            this.result = msg.result;
            this.clocks[0].pause(false);
            this.clocks[1].pause(false);
            this.dests = {};
            if (this.result === "*" && !this.spectator)
                sound.gameEndSound(msg.result, this.mycolor);
            this.gameOver(msg.rdiffs);
            this.moveList.selectPly(this.ply);

            this.moveList.addResult();

            if (msg.ct !== "") {
                this.ctableContainer = patch(this.ctableContainer, h('div#ctable-container'));
                this.ctableContainer = patch(this.ctableContainer, crosstableView(msg.ct, this.gameId));
            }

            // clean up gating/promotion widget left over the ground while game ended by time out
            const container = document.getElementById('extension_choice') as HTMLElement;
            if (container instanceof Element) patch(container, h('extension'));

            if (this.tv) {
                setInterval(() => this.doSend({ type: "updateTV", gameId: this.gameId, profileId: this.profileId }), 2000);
            }
        }
    }

    private onMsgUpdateTV(msg) {
        if (msg.gameId !== this.gameId) {
            if (this.profileId !== "") {
                window.location.assign(this.home + '/@/' + this.profileId + '/tv');
            } else {
                window.location.assign(this.home + '/tv');
            }
            // TODO: reuse current websocket to fix https://github.com/gbtami/pychess-variants/issues/142
            // this.doSend({ type: "game_user_connected", username: this.model["username"], gameId: msg.gameId });
        }
    }

    protected onMsgBoard(msg) {
        if (msg.gameId !== this.gameId) return;

        const pocketsChanged = this.hasPockets && (getPockets(this.fullfen) !== getPockets(msg.fen));

        // console.log("got board msg:", msg);
        const latestPly = (this.ply === -1 || msg.ply === this.ply + 1);
        if (latestPly) this.ply = msg.ply;

        this.fullfen = msg.fen;

        if (this.variant.gate) {
            // When castling with gating is possible 
            // e1g1, e1g1h, e1g1e, h1e1h, h1e1e all will be offered by moving our king two squares
            // so we filter out rook takes king moves (h1e1h, h1e1e) from dests
            for (const orig of Object.keys(msg.dests)) {
                const movingPiece = this.chessground.state.pieces[orig];
                if (movingPiece !== undefined && movingPiece.role === "r-piece") {
                    msg.dests[orig] = msg.dests[orig].filter(x => {
                        const destPiece = this.chessground.state.pieces[x];
                        return destPiece === undefined || destPiece.role !== 'k-piece';
                    });
                }
            }
        }
        this.dests = (msg.status < 0) ? msg.dests : {};

        // list of legal promotion moves
        this.clocktimes = msg.clocks;

        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.result = msg.result;
        this.status = msg.status;

        if (msg.steps.length > 1) {
            this.steps = [];
            const container = document.getElementById('movelist') as HTMLElement;
            patch(container, h('div#movelist'));

            msg.steps.forEach(step => {
                this.steps.push(step);
            });

            this.moveList.clear();
            this.moveList.addPlies(this.steps);
            this.moveList.activatePly(this.steps.length - 1);
            /* TODO
            const full = true;
            const activate = true;
            const result = false;
            updateMovelist(this, full, activate, result);
            */
        } else {
            if (msg.ply === this.steps.length) {
                const step: Step = {
                    ply: msg.ply,
                    fen: msg.fen,
                    move: msg.lastMove,
                    check: msg.check,
                    turnColor: this.turnColor,
                    capture: false, // TODO
                    //san: msg.steps[0].san,
                };
                this.steps.push(step);
                /* TODO
                const full = false;
                const activate = !this.spectator || latestPly;
                const result = false;
                updateMovelist(this, full, activate, result);
                */
                this.moveList.addPly(step);
                if (!this.spectator || latestPly) {
                    this.moveList.activatePly(msg.ply);
                    this.moveList.scrollToActivePly();
                }
            }
        }

        this.abortable = Number(msg.ply) <= 1;
        if (!this.spectator && !this.abortable && this.result === "*") {
            const container = document.getElementById('abort') as HTMLElement;
            patch(container, h('button#abort', { props: {disabled: true} }));
        }

        let lastMove = msg.lastMove;
        if (lastMove !== null) {
            lastMove = uci2cg(lastMove);
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            lastMove = lastMove.includes('@') ? [lastMove.slice(-2)] : [lastMove.slice(0, 2), lastMove.slice(2, 4)];
        }
        // save capture state before updating chessground
        // 960 king takes rook castling is not capture
        //const step = this.steps[this.steps.length - 1];
        let capture = false;
        //if (step.san !== undefined) {
            //capture = (lastMove !== null) && ((this.chessground.state.pieces[lastMove[1]] && step.san.slice(0, 2) !== 'O-') || (step.san.slice(1, 2) === 'x'));
        //}
        // console.log("CAPTURE ?", capture, lastMove, step);
        if (lastMove !== null && (this.turnColor === this.mycolor || this.spectator)) {
            sound.moveSound(this.variant, capture);
        } else {
            lastMove = [];
        }
        this.checkStatus(msg);
        if (!this.spectator && msg.check) {
            sound.check();
        }

        if (this.variant.counting) {
            this.updateCount(msg.fen);
        }

        if (this.variant.materialPoint) {
            this.updatePoint(msg.fen);
        }

        const oppclock = !this.flip ? 0 : 1;
        const myclock = 1 - oppclock;

        this.clocks[0].pause(false);
        this.clocks[1].pause(false);
        if (this.byoyomi) {
            this.clocks[oppclock].byoyomiPeriod = msg.byo[(this.oppcolor === 'white') ? 0 : 1];
            this.clocks[myclock].byoyomiPeriod = msg.byo[(this.mycolor === 'white') ? 0 : 1];
        }
        this.clocks[oppclock].setTime(this.clocktimes[this.oppcolor]);
        this.clocks[myclock].setTime(this.clocktimes[this.mycolor]);

        if (this.spectator) {
            if (latestPly) {
                this.chessground.set({
                    fen: parts[0],
                    turnColor: this.turnColor,
                    check: msg.check,
                    lastMove: lastMove,
                });
                if (pocketsChanged) this.updatePockets(msg.fen);
            }
            if (!this.abortable && msg.status < 0) {
                if (this.turnColor === this.mycolor) {
                    this.clocks[myclock].start();
                } else {
                    this.clocks[oppclock].start();
                }
            }
        } else {
            if (this.turnColor === this.mycolor) {
                if (latestPly) {
                    this.chessground.set({
                        fen: parts[0],
                        turnColor: this.turnColor,
                        movable: {
                            free: false,
                            color: this.mycolor,
                            dests: this.dests,
                        },
                        check: msg.check,
                        lastMove: lastMove,
                    });
                    if (pocketsChanged) this.updatePockets(msg.fen);

                    // prevent sending premove/predrop when (auto)reconnecting websocked asks server to (re)sends the same board to us
                    if (latestPly) {
                        // console.log("trying to play premove....");
                        if (this.premove) this.performPremove();
                        if (this.predrop) this.performPredrop();
                    }
                }
                if (!this.abortable && msg.status < 0) {
                    this.clocks[myclock].start();
                    // console.log('MY CLOCK STARTED');
                }
            } else {
                this.chessground.set({
                    // giving fen here will place castling rooks to their destination in chess960 variants
                    fen: parts[0],
                    turnColor: this.turnColor,
                    check: msg.check,
                });
                if (!this.abortable && msg.status < 0) {
                    this.clocks[oppclock].start();
                    // console.log('OPP CLOCK  STARTED');
                }
            }
        };
    }

    goPly(ply: number, plyVari: number = 0) {
        super.goPly(ply, plyVari);

        if (this.turnColor === this.mycolor && this.result === "*" && ply === this.steps.length - 1) {
            this.chessground.set({
                movable: {
                    dests: undefined,
                },
            });
        }
    }

    doSendMove(orig, dest, promo) {
        // pause() will add increment!
        const oppclock = !this.flip ? 0 : 1
        const myclock = 1 - oppclock;
        const movetime = (this.clocks[myclock].running) ? Date.now() - this.clocks[myclock].startTime : 0;
        this.clocks[myclock].pause((this.base === 0 && this.ply < 2) ? false : true);
        // console.log("sendMove(orig, dest, prom)", orig, dest, promo);

        const move = cg2uci(orig + dest + promo);

        // console.log("sendMove(move)", move);
        let bclock, clocks;
        if (!this.flip) {
            bclock = this.mycolor === "black" ? 1 : 0;
        } else {
            bclock = this.mycolor === "black" ? 0 : 1;
        }
        const wclock = 1 - bclock

        const increment = (this.inc > 0 && this.ply >= 2 && !this.byoyomi) ? this.inc * 1000 : 0;

        const bclocktime = (this.mycolor === "black" && this.preaction) ? this.clocktimes.black + increment: this.clocks[bclock].duration;
        const wclocktime = (this.mycolor === "white" && this.preaction) ? this.clocktimes.white + increment: this.clocks[wclock].duration;

        clocks = {movetime: (this.preaction) ? 0 : movetime, black: bclocktime, white: wclocktime};

        this.doSend({ type: "move", gameId: this.gameId, move: move, clocks: clocks, ply: this.ply + 1 });

        if (!this.abortable) this.clocks[oppclock].start();
    }

    protected updateCount(fen) {
        [this.vmiscInfoW, this.vmiscInfoB] = updateCount(fen, this.vmiscInfoW, this.vmiscInfoB);
        const countButton = document.getElementById('count') as HTMLElement;
        if (countButton) {
            const [ , , countingSide, countingType ] = getCounting(fen);
            const myturn = this.mycolor === this.turnColor;
            if (countingType === 'board') {
                if ((countingSide === 'w' && this.mycolor === 'white') || (countingSide === 'b' && this.mycolor === 'black'))
                    patch(countButton, h('button#count', { on: { click: () => this.stopCount() }, props: {title: _('Stop counting')}, class: { disabled: !myturn } }, _('Stop')));
                else
                    patch(countButton, h('button#count', { on: { click: () => this.startCount() }, props: {title: _('Start counting')}, class: { disabled: !(myturn && countingSide === '') } }, _('Count')));
            } else {
                patch(countButton, h('button#count', { props: {title: _('Start counting')}, class: { disabled: true } }, _('Count')));
            }
        }
    }

    private startCount() {
        this.doSend({ type: "count", gameId: this.gameId, mode: "start" });
    }

    private stopCount() {
        this.doSend({ type: "count", gameId: this.gameId, mode: "stop" });
    }

    protected updatePoint(fen) {
        [this.vmiscInfoW, this.vmiscInfoB] = updatePoint(fen, this.vmiscInfoW, this.vmiscInfoB);
    }

    private setPremove(orig: Key, dest: Key, metadata?: SetPremoveMetadata) {
        this.premove = { orig, dest, metadata };
        // console.log("setPremove() to:", orig, dest, meta);
    }

    private unsetPremove() {
        this.premove = undefined;
        this.preaction = false;
    }

    private setPredrop(role: Role, key: Key) {
        this.predrop = { role, key };
        // console.log("setPredrop() to:", role, key);
    }

    private unsetPredrop() {
        this.predrop = undefined;
        this.preaction = false;
    }

    private performPremove() {
        // const { orig, dest, meta } = this.premove;
        // TODO: promotion?
        // console.log("performPremove()", orig, dest, meta);
        this.chessground.playPremove();
        this.premove = undefined;
    }

    private performPredrop() {
        // const { role, key } = this.predrop;
        // console.log("performPredrop()", role, key);
        this.chessground.playPredrop(drop => { return dropIsValid(this.dests, drop.role, drop.key); });
        this.predrop = undefined;
    }
    
    protected onMessage(evt) {
        super.onMessage(evt);
        // console.log("<+++ onMessage():", evt.data);
        const msg = JSON.parse(evt.data);
        if (msg.gameId !== this.gameId) return;
        switch (msg.type) {
            case "gameStart": this.onMsgGameStart(msg); break;
            case "gameEnd": this.checkStatus(msg); break;
            case "user_present": this.onMsgUserPresent(msg); break;
            case "user_disconnected": this.onMsgUserDisconnected(msg); break;
            case "new_game": this.onMsgNewGame(msg); break;
            case "offer": this.onMsgOffer(msg); break;
            case "moretime": this.onMsgMoreTime(msg); break;
            case "updateTV": this.onMsgUpdateTV(msg); break;
            case "setup": this.onMsgSetup(msg); break;
            case "count": this.onMsgCount(msg); break;
        }
    }

    protected onMsgUserConnected(msg) {
        this.username = msg["username"];

        if (this.spectator) {
            this.doSend({ type: "is_user_present", username: this.wplayer, gameId: this.gameId });
            this.doSend({ type: "is_user_present", username: this.bplayer, gameId: this.gameId });
        } else {
            const opp_name = this.username === this.wplayer ? this.bplayer : this.wplayer;
            this.doSend({ type: "is_user_present", username: opp_name, gameId: this.gameId });

            const container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', { class: { "icon": true, "icon-online": true, "icon-offline": false } }));

            // prevent sending gameStart message when user just reconecting
            if (msg.ply === 0) {
                this.doSend({ type: "ready", gameId: this.gameId });
            }
        }

        // we want to know lastMove and check status
        this.doSend({ type: "board", gameId: this.gameId });
    }

    private onMsgGameStart(msg) {
        // console.log("got gameStart msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (!this.spectator) sound.genericNotify();
    }

    private onMsgUserPresent(msg) {
        // console.log(msg);
        if (msg.username === this.players[0]) {
            const container = document.getElementById('player0') as HTMLElement;
            patch(container, h('i-side.online#player0', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        } else {
            const container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": true, "icon-offline": false}}));
        }
    }

    private onMsgUserDisconnected(msg) {
        // console.log(msg);
        if (msg.username === this.players[0]) {
            const container = document.getElementById('player0') as HTMLElement;
            patch(container, h('i-side.online#player0', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        } else {
            const container = document.getElementById('player1') as HTMLElement;
            patch(container, h('i-side.online#player1', {class: {"icon": true, "icon-online": false, "icon-offline": true}}));
        }
    }

    private onMsgNewGame(msg) {
        window.location.assign(this.home + '/' + msg["gameId"]);
    }

    private onMsgOffer(msg) {
        chatMessage("", msg.message, "roundchat");
    }

    private onMsgMoreTime(msg) {
        chatMessage('', msg.username + _(' +15 seconds'), "roundchat");
        if (this.spectator) {
            if (msg.username === this.players[0]) {
                this.clocks[0].setTime(this.clocks[0].duration + 15000);
            } else {
                this.clocks[1].setTime(this.clocks[1].duration + 15000);
            }
        } else {
            this.clocks[1].setTime(this.clocks[1].duration + 15000);
        }
    }

    private onMsgCount(msg) {
        chatMessage("", msg.message, "roundchat");
        if (msg.message.endsWith("started")) {
            if (this.turnColor === 'white')
                this.vmiscInfoW = patch(this.vmiscInfoW, h('div#count-white', '0/64'));
            else
                this.vmiscInfoB = patch(this.vmiscInfoB, h('div#count-black', '0/64'));
        }
        else if (msg.message.endsWith("stopped")) {
            if (this.turnColor === 'white')
                this.vmiscInfoW = patch(this.vmiscInfoW, h('div#count-white', ''));
            else
                this.vmiscInfoB = patch(this.vmiscInfoB, h('div#count-black', ''));
        }
    }

}
