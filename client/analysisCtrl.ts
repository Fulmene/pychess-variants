//import Module from 'ffish-es6';
//TODO: importing from node-modules causes error while running gulp:
//'import' and 'export' may appear only with 'sourceType: module'
//import ffish from 'ffish';
import Sockette from 'sockette';

import { init } from 'snabbdom';
import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

import { Dests, Key, Notation } from 'chessgroundx/types';
import { DrawShape } from 'chessgroundx/draw';

import { _ } from './i18n';
import { GameController } from './gameCtrl';
import { sound } from './sound';
import { uci2cg, cg2uci, san2role } from './chess';
import { chatView } from './chat';
import { povChances } from './winningChances';
import { copyTextToClipboard } from './clipboard';
import { analysisChart } from './chart';
import { copyBoardToPNG } from './png'; 
import { download } from './document';
//import { variantsIni } from './variantsIni';

const patch = init([klass, attributes, properties, listeners]);

const EVAL_REGEX = new RegExp(''
  + /^info depth (\d+) seldepth \d+ multipv (\d+) /.source
  + /score (cp|mate) ([-\d]+) /.source
  + /(?:(upper|lower)bound )?nodes (\d+) nps \S+ /.source
  + /(?:hashfull \d+ )?(?:tbhits \d+ )?time (\S+) /.source
  + /pv (.+)/.source);

const maxDepth = 18;
const maxThreads = Math.max((navigator.hardwareConcurrency || 1) - 1, 1);

export default class AnalysisController extends GameController {
    anon: boolean;
    embed: boolean;
    vpgn: VNode;
    vscore: VNode | HTMLElement;
    vinfo: VNode | HTMLElement;
    vpv: VNode | HTMLElement;
    uci_usi: string;
    plyVari: number;
    analysisChart;
    localEngine: boolean;
    localAnalysis: boolean;
    ffish;
    ffishBoard;
    maxDepth: number;
    isAnalysisBoard: boolean;
    isEngineReady: boolean;
    startPly: number;
    notationAsObject;
    arrow: boolean;

    constructor(el, model) {
        super(el, model);

        this.isAnalysisBoard = model.gameId === "";

        const onOpen = (evt) => {
            console.log("ctrl.onOpen()", evt);
            if (this.embed) {
                this.doSend({ type: "embed_user_connected", gameId: this.gameId });
            } else if (!this.isAnalysisBoard) {
                this.doSend({ type: "game_user_connected", username: this.username, gameId: this.gameId });
            }
        };

        const opts = {
            maxAttempts: 10,
            onopen: e => onOpen(e),
            onmessage: e => this.onMessage(e),
            onreconnect: e => console.log('Reconnecting in round...', e),
            onmaximum: e => console.log('Stop Attempting!', e),
            onclose: e => console.log('Closed!', e),
            onerror: e => console.log('Error:', e),
        };

        const ws = location.host.includes('pychess') ? 'wss://' : 'ws://';
        this.sock = new Sockette(ws + location.host + "/wsr", opts);

        this.embed = model.embed;

        // is local stockfish.wasm engine supports current variant?
        this.localEngine = false;

        // is local engine analysis enabled? (the switch)
        this.localAnalysis = false;

        // UCI isready/readyok
        this.isEngineReady = false;

        // loaded Fairy-Stockfish ffish.js wasm module
        this.ffish = null;
        this.ffishBoard = null;
        this.maxDepth = maxDepth;

        this.ply = 0;
        this.plyVari = 0;

        this.startPly = model.ply ? Number(model.ply) : -1;

        const parts = this.fullfen.split(" ");

        const fen_placement = parts[0];

        this.chessground.set({
            fen: fen_placement,
            orientation: this.mycolor,
            turnColor: this.turnColor,
            movable: {
                free: false,
                color: this.mycolor,
                events: {
                    after: (orig, dest, meta) => this.onUserMove(orig, dest, meta),
                    afterNewPiece: (role, key, meta) => this.onUserDrop(role, key, meta),
                }
            },
            events: {
                move: (orig, dest, capturedPiece) => this.onMove(orig, dest, capturedPiece),
                dropNewPiece: (piece, key) => this.onDrop(piece, key),
                select: (key) => this.onSelect(key),
            }
        });

        if (!this.isAnalysisBoard && !this.embed) {
            this.ctableContainer = document.getElementById('ctable-container') as HTMLElement;
        }

        // Hide #chart div (embed view has no #chart)
        if (!this.embed) {
            const element = document.getElementById('chart') as HTMLElement;
            element.style.display = 'none';
        }

        if (!this.isAnalysisBoard && !this.embed) {
            patch(document.getElementById('roundchat') as HTMLElement, chatView(this, "roundchat"));
            document.documentElement.style.setProperty('--toolsHeight', '136px');
        } else {
            this.checkStatus({fen: this.fullfen});
            document.documentElement.style.setProperty('--toolsHeight', '92px');
        }

        if (!this.embed) {
            patch(document.getElementById('input') as HTMLElement, h('input#input', this.renderInput()));

            this.vscore = document.getElementById('score') as HTMLElement;
            this.vinfo = document.getElementById('info') as HTMLElement;
            this.vpv = document.getElementById('pv') as HTMLElement;
        }

        if (this.variant.materialPoint) {
            const miscW = document.getElementById('misc-infow') as HTMLElement;
            const miscB = document.getElementById('misc-infob') as HTMLElement;
            miscW.style.textAlign = 'right';
            miscB.style.textAlign = 'left';
            miscW.style.width = '100px';
            miscB.style.width = '100px';
            patch(document.getElementById('misc-info-center') as HTMLElement, h('div#misc-info-center', '-'));
            (document.getElementById('misc-info') as HTMLElement).style.justifyContent = 'space-around';
        }

        if (this.variant.counting) {
            (document.getElementById('misc-infow') as HTMLElement).style.textAlign = 'center';
            (document.getElementById('misc-infob') as HTMLElement).style.textAlign = 'center';
        }
    }

    private renderInput() {
        return {
            attrs: {
                disabled: !this.localEngine,
            },
            on: {change: () => {
                this.localAnalysis = !this.localAnalysis;
                if (this.localAnalysis) {
                    this.vinfo = patch(this.vinfo, h('info#info', '-'));
                    this.engineStop();
                    this.engineGo();
                } else {
                    this.vinfo = patch(this.vinfo, h('info#info', _('in local browser')));
                    this.vpv = patch(this.vpv, h('div#pv'));
                    this.engineStop();
                }
            }}
        };
    }

    private drawAnalysisChart(withRequest: boolean) {
        if (withRequest) {
            if (this.anon) {
                alert(_('You need an account to do that.'));
                return;
            }
            const element = document.getElementById('request-analysis') as HTMLElement;
            if (element !== null) element.style.display = 'none';

            this.doSend({ type: "analysis", username: this.username, gameId: this.gameId });
            const loaderEl = document.getElementById('loader') as HTMLElement;
            loaderEl.style.display = 'block';
        }
        const chartEl = document.getElementById('chart') as HTMLElement;
        chartEl.style.display = 'block';
        analysisChart(this);
    }

    private checkStatus(msg) {
        if ((msg.gameId !== this.gameId && !this.isAnalysisBoard) || this.embed) return;
        if ((msg.status >= 0) || this.isAnalysisBoard) {

            // Save finished game full pgn sent by server
            if (msg.pgn !== undefined) this.pgn = msg.pgn;
            // but on analysis page we always present pgn move list leading to current shown position!
            const pgn = (this.isAnalysisBoard) ? this.getPgn() : this.pgn;

            this.uci_usi = msg.uci_usi;

            let container = document.getElementById('copyfen') as HTMLElement;
            if (container !== null) {
                const buttons = [
                    h('a.i-pgn', { on: { click: () => download("pychess-variants_" + this.gameId, pgn) } }, [
                        h('i', {props: {title: _('Download game to PGN file')}, class: {"icon": true, "icon-download": true} }, _(' Download PGN'))]),
                    h('a.i-pgn', { on: { click: () => copyTextToClipboard(this.uci_usi) } }, [
                        h('i', {props: {title: _('Copy USI/UCI to clipboard')}, class: {"icon": true, "icon-clipboard": true} }, _(' Copy UCI/USI'))]),
                    h('a.i-pgn', { on: { click: () => copyBoardToPNG(this.fullfen) } }, [
                        h('i', {props: {title: _('Download position to PNG image file')}, class: {"icon": true, "icon-download": true} }, _(' PNG image'))]),
                    ]
                if (this.steps[0].analysis === undefined && !this.isAnalysisBoard) {
                    buttons.push(h('button#request-analysis', { on: { click: () => this.drawAnalysisChart(true) } }, [
                        h('i', {props: {title: _('Request Computer Analysis')}, class: {"icon": true, "icon-bar-chart": true} }, _(' Request Analysis'))])
                    );
                }
                patch(container, h('div', buttons));
            }

            const e = document.getElementById('fullfen') as HTMLInputElement;
            e.value = this.fullfen;

            container = document.getElementById('pgntext') as HTMLElement;
            this.vpgn = patch(container, h('textarea#pgntext', { attrs: { rows: 13, readonly: true, spellcheck: false} }, pgn));

            if (!this.isAnalysisBoard) this.moveList.selectPly(this.ply);
        }
    }

    protected onMsgBoard(msg) {
        if (msg.gameId !== this.gameId) return;

        // TODO const pocketsChanged = this.hasPockets && (getPockets(this.fullfen) !== getPockets(msg.fen));

        // console.log("got board msg:", msg);
        this.ply = msg.ply
        this.fullfen = msg.fen;
        this.dests = msg.dests;
        // list of legal promotion moves
        //this.promotions = msg.promo;

        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.result = msg.result;
        this.status = msg.status;

        if (msg.steps.length > 1) {
            this.steps = [];

            msg.steps.forEach((step, ply) => {
                if (step.analysis !== undefined) {
                    step['ceval'] = step.analysis;
                    const scoreStr = this.buildScoreStr(ply % 2 === 0 ? "w" : "b", step.analysis);
                    step['scoreStr'] = scoreStr;
                }
                this.steps.push(step);
                });
            // TODO updateMovelist(this);

            if (this.steps[0].analysis !== undefined) {
                this.vinfo = patch(this.vinfo, h('info#info', '-'));
                this.drawAnalysisChart(false);
            }
        } else {
            if (msg.ply === this.steps.length) {
                const step = {
                    ply: msg.ply,
                    fen: msg.fen,
                    move: msg.lastMove,
                    check: msg.check,
                    turnColor: this.turnColor,
                    san: msg.steps[0].san,
                    capture: false, // TODO
                };
                this.steps.push(step);
                // TODO updateMovelist(this);
            }
        }

        let lastMove = msg.lastMove;
        if (lastMove !== null) {
            lastMove = uci2cg(lastMove);
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            lastMove = lastMove.indexOf('@') > -1 ? [lastMove.slice(-2)] : [lastMove.slice(0, 2), lastMove.slice(2, 4)];
        }
        // save capture state before updating chessground
        // 960 king takes rook castling is not capture
        //const step = this.steps[this.steps.length - 1];
        const capture = false; // TODO (lastMove !== null) && ((this.chessground.state.pieces[lastMove[1]] && step.san.slice(0, 2) !== 'O-') || (step.san.slice(1, 2) === 'x'));

        if (lastMove !== null && (this.turnColor === this.mycolor || this.spectator)) {
            sound.moveSound(this.variant, capture);
        } else {
            lastMove = [];
        }
        this.checkStatus(msg);

        if (this.spectator) {
            this.chessground.set({
                fen: parts[0],
                turnColor: this.turnColor,
                check: msg.check,
                lastMove: lastMove,
            });
            // TODO if (pocketsChanged) updatePockets(this, this.vpocket0, this.vpocket1);
        }
        if (this.startPly >= 0) {
            this.ply = this.startPly;
            this.moveList.selectPly(this.ply);
        }
    }

    moveIndex(ply) {
      return Math.floor((ply - 1) / 2) + 1 + (ply % 2 === 1 ? '.' : '...');
    }

    notation2ffishjs(n) {
        switch (n) {
            case Notation.DEFAULT: return this.ffish.Notation.DEFAULT;
            case Notation.SAN: return this.ffish.Notation.SAN;
            case Notation.LAN: return this.ffish.Notation.LAN;
            case Notation.SHOGI_HOSKING: return this.ffish.Notation.SHOGI_HOSKING;
            case Notation.SHOGI_HODGES: return this.ffish.Notation.SHOGI_HODGES;
            case Notation.SHOGI_HODGES_NUMBER: return this.ffish.Notation.SHOGI_HODGES_NUMBER;
            case Notation.JANGGI: return this.ffish.Notation.JANGGI;
            case Notation.XIANGQI_WXF: return this.ffish.Notation.XIANGQI_WXF;
            default: return this.ffish.Notation.DEFAULT;
        }
    }

    onFSFline(line) {
        //console.log(line);

        if (line.includes('readyok')) this.isEngineReady = true;

        if (!this.localEngine) {
            if (line.includes('UCI_Variant')) {
                /* TODO
                new (Module as any)().then(loadedModule => {
                    this.ffish = loadedModule;

                    if (this.ffish !== null) {
                        this.ffish.loadVariantConfig(variantsIni);
                        this.notationAsObject = this.notation2ffishjs(this.notation);
                        const availableVariants = this.ffish.variants();
                        //console.log('Available variants:', availableVariants);
                        if (this.variant.name === 'chess' || availableVariants.includes(this.variant.name)) {
                            this.ffishBoard = new this.ffish.Board(this.variant.name, this.fullfen, this.chess960);
                            this.dests = this.getDests();
                            this.chessground.set({ movable: { color: this.turnColor, dests: this.dests } });
                        } else {
                            console.log("Selected variant is not supported by ffish.js");
                        }
                    }
                });
                */

                // TODO: enable S-chess960 when stockfish.wasm catches upstream Fairy-Stockfish
                if ((this.variant.name === 'chess' || line.includes(this.variant.name)) &&
                    !(this.variant.name === 'seirawan' && this.chess960)) {
                    this.localEngine = true;
                    patch(document.getElementById('input') as HTMLElement, h('input#input', {attrs: {disabled: false}}));
                } else {
                    const v = this.variant.name + ((this.chess960) ? '960' : '');
                    const title = _("Selected variant %1 is not supported by stockfish.wasm", v);
                    patch(document.getElementById('slider') as HTMLElement, h('span.sw-slider', {attrs: {title: title}}));
                }
            }
        }

        if (!this.localAnalysis || !this.isEngineReady) return;

        const matches = line.match(EVAL_REGEX);
        if (!matches) {
            if (line.includes('mate 0')) {
                const msg = {type: 'local-analysis', ply: this.ply, color: this.turnColor.slice(0, 1), ceval: {d: 0, s: {mate: 0}}};
                this.onMsgAnalysis(msg);
            }
            return;
        }

        const depth = parseInt(matches[1]),
            multiPv = parseInt(matches[2]),
            isMate = matches[3] === 'mate',
            povEv = parseInt(matches[4]),
            evalType = matches[5],
            nodes = parseInt(matches[6]),
            elapsedMs: number = parseInt(matches[7]),
            moves = matches[8];
        //console.log("---", depth, multiPv, isMate, povEv, evalType, nodes, elapsedMs, moves);

        // Sometimes we get #0. Let's just skip it.
        if (isMate && !povEv) return;

        // For now, ignore most upperbound/lowerbound messages.
        // The exception is for multiPV, sometimes non-primary PVs
        // only have an upperbound.
        // See: https://github.com/ddugovic/Stockfish/issues/228
        if (evalType && multiPv === 1) return;

        let score;
        if (isMate) {
            score = {mate: povEv};
        } else {
            score = {cp: povEv};
        }
        const knps = nodes / elapsedMs;
        const sanMoves = this.ffishBoard.variationSan(moves, this.notationAsObject);
        const msg = {type: 'local-analysis', ply: this.ply, color: this.turnColor.slice(0, 1), ceval: {d: depth, m: moves, p: sanMoves, s: score, k: knps}};
        this.onMsgAnalysis(msg);
    };

    onMoreDepth() {
        this.maxDepth = 99;
        this.engineStop();
        this.engineGo();
    }

    // Updates PV, score, gauge and the best move arrow
    drawEval(ceval, scoreStr, turnColor) {
        let shapes0: DrawShape[] = [];
        this.chessground.setAutoShapes(shapes0);

        const gaugeEl = document.getElementById('gauge') as HTMLElement;
        if (gaugeEl) {
            const blackEl = gaugeEl.querySelector('div.black') as HTMLElement | undefined;
            if (blackEl && ceval !== undefined) {
                const score = ceval['s'];
                // TODO set gauge colour according to the variant's piece colour
                const color = (this.variant.firstColor === "Black") ? turnColor === 'black' ? 'white' : 'black' : turnColor;
                if (score !== undefined) {
                    const ev = povChances(color, score);
                    blackEl.style.height = String(100 - (ev + 1) * 50) + '%';
                }
                else {
                    blackEl.style.height = '50%';
                }
            }
        }

        if (ceval?.p !== undefined) {
            const pv_move = uci2cg(ceval["m"].split(" ")[0]);
            console.log("ARROW", this.arrow);
            if (this.arrow) {
                const atPos = pv_move.indexOf('@');
                if (atPos > -1) {
                    const d = pv_move.slice(atPos + 1, atPos + 3) as Key;
                    let color = turnColor;
                    if (this.variant.sideDetermination === "direction")
                        if (this.flip !== (this.mycolor === "black"))
                            color = (color === 'white') ? 'black' : 'white';
                    shapes0 = [{
                        orig: d,
                        brush: 'paleGreen',
                        piece: {
                            color: color,
                            role: san2role(pv_move.slice(0, atPos))
                        }},
                        { orig: d, brush: 'paleGreen'}
                    ];
                } else {
                    const o = pv_move.slice(0, 2) as Key;
                    const d = pv_move.slice(2, 4) as Key;
                    shapes0 = [{ orig: o, dest: d, brush: 'paleGreen', piece: undefined },];
                }
            }
            this.vscore = patch(this.vscore, h('score#score', scoreStr));
            const info = [h('span', _('Depth') + ' ' + String(ceval.d) + '/' + this.maxDepth)];
            if (ceval.k) {
                if (ceval.d === this.maxDepth && this.maxDepth !== 99) {
                    info.push(
                        h('a.icon.icon-plus-square', {
                            props: {type: "button", title: _("Go deeper")},
                            on: { click: () => this.onMoreDepth() }
                        })
                    );
                } else if (ceval.d !== 99) {
                    info.push(h('span', ', ' + Math.round(ceval.k) + ' knodes/s'));
                }
            }
            this.vinfo = patch(this.vinfo, h('info#info', info));
            let pvSan = ceval.p;
            if (this.ffishBoard !== null) {
                try {
                    pvSan = this.ffishBoard.variationSan(ceval.p, this.notationAsObject);
                    if (pvSan === '') pvSan = ceval.p;
                } catch (error) {
                    pvSan = ceval.p
                }
            }
            this.vpv = patch(this.vpv, h('div#pv', [h('pvline', ceval.p !== undefined ? pvSan : ceval.m)]));
        } else {
            this.vscore = patch(this.vscore, h('score#score', ''));
            this.vinfo = patch(this.vinfo, h('info#info', _('in local browser')));
            this.vpv = patch(this.vpv, h('div#pv'));
        }

        console.log(shapes0);
        this.chessground.set({
            drawable: {autoShapes: shapes0},
        });
    }

    // Updates chart and score in movelist
    drawServerEval(ply, scoreStr) {
        if (ply > 0) {
            const evalEl = document.getElementById('ply' + String(ply)) as HTMLElement;
            patch(evalEl, h('eval#ply' + String(ply), scoreStr));
        }

        analysisChart(this);
        const hc = this.analysisChart;
        if (hc !== undefined) {
            const hcPt = hc.series[0].data[ply];
            if (hcPt !== undefined) hcPt.select();
        }
    }

    engineStop() {
        this.isEngineReady = false;
        window.fsf.postMessage('stop');
        window.fsf.postMessage('isready');
    }

    engineGo() {
        if (this.chess960) {
            window.fsf.postMessage('setoption name UCI_Chess960 value true');
        }
        if (this.variant.name !== 'chess') {
            window.fsf.postMessage('setoption name UCI_Variant value ' + this.variant.name);
        }
        //console.log('setoption name Threads value ' + maxThreads);
        window.fsf.postMessage('setoption name Threads value ' + maxThreads);

        //console.log('position fen ', this.fullfen);
        window.fsf.postMessage('position fen ' + this.fullfen);

        if (this.maxDepth >= 99) {
            window.fsf.postMessage('go depth 99');
        } else {
            window.fsf.postMessage('go movetime 90000 depth ' + this.maxDepth);
        }
    }

    getDests() {
        const legalMoves = this.ffishBoard.legalMoves().split(" ");
        // console.log(legalMoves);
        const dests: Dests = {};
        //this.promotions = [];
        legalMoves.forEach((move) => {
            move = uci2cg(move);
            const source = move.slice(0, 2);
            const dest = move.slice(2, 4);
            if (source in dests) {
                dests[source].push(dest);
            } else {
                dests[source] = [dest];
            }

            /*
            const tail = move.slice(-1);
            if (tail > '9' || tail === '+') {
                if (!(this.variant.gate && (move.slice(1, 2) === '1' || move.slice(1, 2) === '8'))) {
                    this.promotions.push(move);
                }
            }
            if (this.variant.promotion === 'kyoto' && move.slice(0, 1) === '+') {
                this.promotions.push(move);
            }
            */
        });
        this.chessground.set({ movable: { dests: dests }});
        return dests;
    }

    // When we are moving inside a variation move list
    // then plyVari > 0 and ply is the index inside vari movelist
    goPly(ply: number, plyVari: number = 0) {
        super.goPly(ply, plyVari);

        if (this.localAnalysis) {
            this.engineStop();
            // Go back to the main line
            if (plyVari === 0) {
                const container = document.getElementById('vari') as HTMLElement;
                patch(container, h('div#vari', ''));
            }
        }

        const step = (plyVari > 0) ? this.steps[plyVari]['vari'][ply] : this.steps[ply];
        let move = step.move;
        if (move !== undefined) {
            move = uci2cg(move);
            move = move.indexOf('@') > -1 ? [move.slice(-2)] : [move.slice(0, 2), move.slice(2, 4)];
        }

        this.chessground.set({
            fen: step.fen,
            turnColor: step.turnColor,
            movable: {
                color: step.turnColor,
                dests: this.dests,
                },
            check: step.check,
            lastMove: move,
        });

        // Go back to the main line
        if (plyVari === 0) {
            this.ply = ply
        }
        this.turnColor = step.turnColor;

        if (this.plyVari > 0 && plyVari === 0) {
            this.steps[this.plyVari]['vari'] = undefined;
            this.plyVari = 0;
            // TODO updateMovelist(this);
        }

        if (this.embed) return;

        if (this.ffishBoard !== null) {
            this.ffishBoard.setFen(this.fullfen);
            this.dests = this.getDests();
        }

        this.drawEval(step.ceval, step.scoreStr, step.turnColor);
        this.drawServerEval(ply, step.scoreStr);

        // TODO: multi PV
        this.maxDepth = maxDepth;
        if (this.localAnalysis) this.engineGo();

        const e = document.getElementById('fullfen') as HTMLInputElement;
        e.value = this.fullfen;

        if (this.isAnalysisBoard) {
            const idxInVari = (plyVari > 0) ? ply : 0;
            this.vpgn = patch(this.vpgn, h('textarea#pgntext', { attrs: { rows: 13, readonly: true, spellcheck: false} }, this.getPgn(idxInVari)));
        } else {
            const hist = this.home + '/' + this.gameId + '?ply=' + ply.toString();
            window.history.replaceState({}, "", hist);
        }
    }

    private getPgn(idxInVari  = 0) {
        const moves : string[] = [];
        for (let ply = 1; ply <= this.ply; ply++) {
            const moveCounter = (ply % 2 !== 0) ? (ply + 1) / 2 + '.' : '';
            if (this.steps[ply]['vari'] !== undefined && this.plyVari > 0) {
                const variMoves = this.steps[ply]['vari'];
                for (let idx = 0; idx <= idxInVari; idx++) {
                    moves.push(moveCounter + variMoves[idx]['sanSAN']);
                }
                break;
            }
            moves.push(moveCounter + this.steps[ply]['sanSAN']);
        }
        return moves.join(' ');
    }

    doSendMove(orig, dest, promo) {
        const move = cg2uci(orig + dest + promo);
        const san = this.ffishBoard.sanMove(move, this.notationAsObject);
        const sanSAN = this.ffishBoard.sanMove(move);
        // console.log('sendMove()', move, san);
        // Instead of sending moves to the server we can get new FEN and dests from ffishjs
        this.ffishBoard.push(move);
        this.dests = this.getDests();

        // We can't use ffishBoard.gamePly() to determine newply because it returns +1 more
        // when new this.ffish.Board() initial FEN moving color was "b"
        const moves = this.ffishBoard.moveStack().split(' ');
        const newPly = moves.length;

        const msg = {
            gameId: this.gameId,
            fen: this.ffishBoard.fen(),
            ply: newPly,
            lastMove: move,
            dests: this.dests,
            //promo: this.promotions,
            bikjang: this.ffishBoard.isBikjang(),
            check: this.ffishBoard.isCheck(),
        }
        this.onMsgAnalysisBoard(msg);

        const step = {
            ply: msg.ply,
            'fen': msg.fen,
            'move': msg.lastMove,
            'check': msg.check,
            'turnColor': this.turnColor,
            'san': san,
            'sanSAN': sanSAN,
            capture: false, // TODO
            };

        // New main line move
        if (this.ffishBoard.gamePly() === this.steps.length && this.plyVari === 0) {
            this.steps.push(step);
            this.ply = this.ffishBoard.gamePly()
            // TODO updateMovelist(this);

            this.checkStatus(msg);
        // variation move
        } else {
            // new variation starts
            if (newPly === 1) {
                if (msg.lastMove === this.steps[this.ply].move) {
                    // existing main line played
                    this.moveList.selectPly(this.ply);
                    return;
                }
                if (this.steps[this.plyVari]['vari'] === undefined || msg.ply === this.steps[this.plyVari]['vari'].length) {
                    // continuing the variation
                    this.plyVari = this.ffishBoard.gamePly();
                    this.steps[this.plyVari]['vari'] = [];
                } else {
                    // variation in the variation: drop old moves
                    this.steps[this.plyVari]['vari'] = this.steps[this.plyVari]['vari'].slice(0, this.ffishBoard.gamePly() - this.plyVari);    
                }
            }
            this.steps[this.plyVari]['vari'].push(step);

            /* TODO
            const full = true;
            const activate = false;
            updateMovelist(this, full, activate);
            activatePlyVari(this.plyVari + this.steps[this.plyVari]['vari'].length - 1);
            */
        }

        const e = document.getElementById('fullfen') as HTMLInputElement;
        e.value = this.fullfen;

        if (this.isAnalysisBoard) {
            const idxInVari = (this.plyVari > 0) ? this.steps[this.plyVari]['vari'].length - 1 : 0;
            this.vpgn = patch(this.vpgn, h('textarea#pgntext', { attrs: { rows: 13, readonly: true, spellcheck: false} }, this.getPgn(idxInVari)));
        }
        // TODO: But sending moves to the server will be useful to implement shared live analysis!
        // this.doSend({ type: "analysis_move", gameId: this.gameId, move: move, fen: this.fullfen, ply: this.ply + 1 });
    }

    private onMsgAnalysisBoard(msg) {
        // console.log("got analysis_board msg:", msg);
        if (msg.gameId !== this.gameId) return;
        if (this.localAnalysis) this.engineStop();

        // TODO const pocketsChanged = this.hasPockets && (getPockets(this.fullfen) !== getPockets(msg.fen));

        this.fullfen = msg.fen;
        this.dests = msg.dests;
        // list of legal promotion moves
        //this.promotions = msg.promo;
        this.ply = msg.ply

        const parts = msg.fen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";
        let lastMove = msg.lastMove;
        if (lastMove !== null) {
            lastMove = uci2cg(lastMove);
            // drop lastMove causing scrollbar flicker,
            // so we remove from part to avoid that
            lastMove = lastMove.indexOf('@') > -1 ? [lastMove.slice(-2)] : [lastMove.slice(0, 2), lastMove.slice(2, 4)];
        }

        this.chessground.set({
            fen: this.fullfen,
            turnColor: this.turnColor,
            lastMove: lastMove,
            check: msg.check,
            movable: {
                color: this.turnColor,
                dests: this.dests,
            },
        });

        // TODO if (pocketsChanged) updatePockets(this, this.vpocket0, this.vpocket1);

        if (this.localAnalysis) this.engineGo();
    }

    private buildScoreStr(color, analysis) {
        const score = analysis['s'];
        let scoreStr = '';
        let ceval = '';
        if (score['mate'] !== undefined) {
            ceval = score['mate']
            const sign = ((color === 'b' && Number(ceval) > 0) || (color === 'w' && Number(ceval) < 0)) ? '-': '';
            scoreStr = '#' + sign + Math.abs(Number(ceval));
        } else {
            ceval = score['cp']
            let nscore = Number(ceval) / 100.0;
            if (color === 'b') nscore = -nscore;
            scoreStr = nscore.toFixed(1);
        }
        return scoreStr;
    }

    private onMsgAnalysis(msg) {
        // console.log(msg);
        if (msg['ceval']['s'] === undefined) return;

        const scoreStr = this.buildScoreStr(msg.color, msg.ceval);

        // Server side analysis message
        if (msg.type === 'analysis') {
            this.steps[msg.ply]['ceval'] = msg.ceval;
            this.steps[msg.ply]['scoreStr'] = scoreStr;

            if (this.steps.every((step) => {return step.scoreStr !== undefined;})) {
                const element = document.getElementById('loader-wrapper') as HTMLElement;
                element.style.display = 'none';
            }
            this.drawServerEval(msg.ply, scoreStr);
        } else {
            const turnColor = msg.color === 'w' ? 'white' : 'black';
            this.drawEval(msg.ceval, scoreStr, turnColor);
        }
    }

    // User running a fishnet worker asked new server side analysis with chat message: !analysis
    private onMsgRequestAnalysis() {
        this.steps.forEach((step) => {
            step.analysis = undefined;
            step.ceval = undefined;
            step.score = undefined;
        });
        this.drawAnalysisChart(true);
    }

    protected onMessage = (evt) => {
        super.onMessage(evt);
        // console.log("<+++ onMessage():", evt.data);
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
            case "analysis_board": this.onMsgAnalysisBoard(msg); break;
            case "analysis": this.onMsgAnalysis(msg); break;
            case "embed_user_connected": this.onMsgUserConnected(msg); break;
            case "request_analysis": this.onMsgRequestAnalysis(); break;
        }
    }
}
