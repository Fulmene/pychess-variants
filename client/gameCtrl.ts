import Sockette from 'sockette';

import { init } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import { h } from 'snabbdom/h';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';

import * as cg from 'chessgroundx/types';
import * as util from 'chessgroundx/util';

import { UCIOrig, isHandicap, uci2cg, role2san, unpromotedRole, dropIsValid } from './chess';
import { Gating } from './gating';
import { Promotion } from './promotion';
import { MoveList } from './movelist';
import { ChessgroundController } from './cgCtrl';
import { boardSettings } from './boardSettings';
import { updateCount, updatePoint } from './info';
import { sound } from './sound';
import { crosstableView } from './crosstable';
import { chatMessage } from './chat';
import { JSONObject } from './types';
import { _ } from './i18n';

const patch = init([klass, attributes, properties, listeners]);

export abstract class GameController extends ChessgroundController {
    sock: Sockette;

    // Info
    username: string;
    gameId: string;
    fullfen: string;
    handicap: boolean;
    wplayer: string;
    bplayer: string;
    aiLevel: number;

    base: number;
    inc: number;

    players: string[];
    titles: string[];
    ratings: string[];

    hasCounting: boolean;
    hasManualCounting: boolean;
    hasMaterialPoint: boolean;

    // Helpers
    gating: Gating;
    promotion: Promotion;

    // Game state
    turnColor: cg.Color;

    setupFen: string;
    promotions: string[];
    prevPieces: cg.Pieces;

    premove: { orig: cg.Key, dest: cg.Key, metadata?: cg.SetPremoveMetadata } | undefined;
    predrop: { role: cg.Role, key: cg.Key } | undefined;
    preaction: boolean;

    steps;
    moveList: MoveList;
    status: number;
    pgn: string;
    ply: number;
    result: string;

    // UI state
    vplayer0: VNode;
    vplayer1: VNode;
    vmovelist: VNode | HTMLElement;
    gameControls: VNode;
    moveControls: VNode;
    ctableContainer: VNode | HTMLElement;
    clickDrop: cg.Piece | undefined;

    dests: cg.Dests;
    lastmove: cg.Key[];

    flip: boolean;
    spectator: boolean;

    // Settings
    clickDropEnabled: boolean;

    constructor(el, model) {
        super (el, model);

        this.username = model.username;
        this.gameId = model.gameId;
        this.fullfen = model.fen;
        this.handicap = this.variant.alternateStart ? Object.keys(this.variant.alternateStart!).some(alt => isHandicap(alt) && this.variant.alternateStart![alt] === this.fullfen) : false;
        this.wplayer = model.wplayer;
        this.bplayer = model.bplayer;
        this.base = Number(model.base);
        this.inc = Number(model.inc);
        this.aiLevel = Number(model.level);

        this.hasCounting = this.variant.counting !== undefined;
        this.hasManualCounting = this.variant.counting === 'makruk';
        this.hasMaterialPoint = this.variant.materialPoint !== undefined;

        this.status = Number(model.status);
        this.moveList = new MoveList(this);
        this.steps = [];
        this.pgn = "";
        this.ply = -1;

        this.flip = false;
        this.spectator = this.username !== this.wplayer && this.username !== this.bplayer;

        this.clickDropEnabled = true;

        if (this.username === this.bplayer) {
            this.mycolor = 'black';
            this.oppcolor = 'white';

            // Flip the board to the black side
            this.chessground.set({ orientation: 'black' });
            if (this.hasPockets) {
                this.pockets!.white.position = 'top';
                this.pockets!.black.position = 'bottom';
                this.vpocket0 = patch(this.vpocket0!, this.pockets!.white.view());
                this.vpocket1 = patch(this.vpocket1!, this.pockets!.black.view());
            }
            // Update piece style to correct piece orientation in shogi variants
            // TODO remove this when chessgroundx supports piece side class
            boardSettings.getSettings("PieceStyle", this.variant.piece).update();
        }

        // players[0] is top player, players[1] is bottom player
        const myc = this.mycolor[0];
        const oppc = this.oppcolor[0];
        this.players = [
            this[oppc + "player"],
            this[myc + "player"],
        ];
        this.titles = [
            model[oppc + "title"],
            model[myc + "title"],
        ];
        this.ratings = [
            model[oppc + "rating"],
            model[myc + "rating"],
        ];

        this.preaction = false;

        this.result = "*";

        const parts = this.fullfen.split(" ");
        this.turnColor = parts[1] === "w" ? "white" : "black";

        this.steps.push({
            fen: this.fullfen,
            move: undefined,
            check: false,
            turnColor: this.turnColor,
        });

        this.gating = new Gating(this);
        this.promotion = new Promotion(this);

        this.chessground.set({
            fen: this.fullfen,
            turnColor: this.turnColor,
            movable: { free: false },
            draggable: { enabled: false },
            premovable: { enabled: false },
            predroppable: { enabled: false },
            events: { move: (orig, dest, capturedPiece) => this.onMove(orig, dest, capturedPiece) }
        });

        // initialize crosstable
        this.ctableContainer = document.getElementById('ctable-container') as HTMLElement;

        // initialize movelist
        patch(document.getElementById('move-controls') as Element, this.moveList.moveControlView());
        this.vmovelist = document.getElementById('movelist') as HTMLElement;

    }

    sendMove(orig: UCIOrig, dest: cg.Key): void {
        const pieces = this.chessground.state.pieces;
        const moved: cg.Piece = pieces[dest] ?? { role: 'k-piece', color: this.mycolor };
        if (!this.promotion.start(moved.role, orig, dest) && !(this.gating && this.gating.start(this.fullfen, orig, dest)))
            this.doSendMove(orig, dest, '');
    }

    abstract doSendMove(orig: UCIOrig, dest: cg.Key, promo: string): void;

    protected doSend(message: JSONObject) {
        this.sock.send(JSON.stringify(message));
    }

    protected pass() {
        // TODO Use ffish to find pass move
        const dests = this.chessground.state.movable.dests;
        if (dests) {
            const passKey = Object.keys(dests).find(key => dests[key].includes(key as cg.Key)) as cg.Key;
            if (passKey) {
                // prevent calling pass() again by selectSquare() -> onSelect()
                this.chessground.state.movable.dests = undefined;
                this.chessground.selectSquare(passKey as cg.Key);
                sound.moveSound(this.variant, false);
                this.doSendMove(passKey, passKey, '');
            }
        }
    }

    goPly(ply: number, _plyVari: number = 0) {
        const step = this.steps[ply];
        let move = step.move;
        let capture = false;

        if (move !== undefined) {
            move = uci2cg(move);
            move = move.includes('@') ? [ move.slice(-2) ] : [ move.slice(0, 2), move.slice(2, 4) ];
            // 960 king takes rook castling is not capture
            capture = (this.chessground.state.pieces[move[move.length - 1]] !== undefined && step.san.slice(0, 2) !== 'O-') || (step.san.slice(1, 2) === 'x');
        }

        this.updateBoard(step.fen, step.turnColor, step.dests, step.check, move);

        //if (ply === this.ply + 1)
        sound.moveSound(this.variant, capture);
    }

    updateBoard(fen: cg.FEN, turnColor: cg.Color, dests: cg.Dests, check: boolean, lastMove: cg.Key[]) {
        this.fullfen = fen;

        this.chessground.set({
            fen: fen,
            turnColor: turnColor,
            movable: {
                color: turnColor,
                dests: dests,
            },
            check: check,
            lastMove: lastMove,
        });

        this.updatePockets(fen);
        this.updateCount(fen);
        this.updatePoint(fen);
    }

    protected updateCount(fen: cg.FEN) {
        if (this.hasCounting)
            updateCount(fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
    }

    protected updatePoint(fen: cg.FEN) {
        if (this.hasMaterialPoint)
            updatePoint(fen, document.getElementById('misc-infow') as HTMLElement, document.getElementById('misc-infob') as HTMLElement);
    }

    protected onMove(orig: cg.Key, dest: cg.Key, capturedPiece?: cg.Piece) {
        console.log("   ground.onMove()", orig, dest, capturedPiece);
        sound.moveSound(this.variant, capturedPiece !== undefined);
    }

    protected onDrop(piece: cg.Piece, dest: cg.Key) {
        console.log("ground.onDrop()", piece, dest);
        if (dest != 'a0' && piece.role && dropIsValid(this.dests, piece.role, dest)) {
            sound.moveSound(this.variant, false);
        } else if (this.clickDropEnabled) {
            this.clickDrop = piece;
        }
    }

    protected onSelect(key: cg.Key) {
        if (this.chessground.state.movable.dests === undefined) return;

        if (key != 'a0' && 'a0' in this.chessground.state.movable.dests) {
            if (this.clickDropEnabled && this.clickDrop !== undefined && dropIsValid(this.dests, this.clickDrop.role, key)) {
                this.chessground.newPiece(this.clickDrop, key);
                this.onUserDrop(this.clickDrop.role, key, { premove: false, predrop: this.predrop !== undefined });
            }
            this.clickDrop = undefined;
            // If drop selection was set to dropDests we have to restore dests here
            this.chessground.set({ movable: { dests: this.dests }});
        }

        // Save state.pieces to help recognise 960 castling (king takes rook) moves
        // Shouldn't this be implemented in chessground instead?
        if (this.chess960 && this.variant.gate) {
            this.prevPieces = Object.assign({}, this.chessground.state.pieces);
        }

        // Janggi pass and Sittuyin in place promotion on Ctrl+click
        // TODO implement this in chessgroundx instead, possibly with a double click
        if (this.chessground.state.stats.ctrlKey && 
            (this.chessground.state.movable.dests[key]?.includes(key))
        ) {

            // TODO test if (!this.promotion.start(this.chessground.pieces[key].role, key, key) && !(this.variant.gate && this.gating.start(this.fullfen, orig, dest))) this.sendMove(key, key, '');

            const piece = this.chessground.state.pieces[key];
            if (this.variant.name === 'sittuyin') { // TODO make this more generic
                // console.log("Ctrl in place promotion", key);
                const pieces: cg.Pieces = {};
                pieces[key] = {
                    color: piece!.color,
                    role: 'f-piece',
                    promoted: true
                };
                this.chessground.setPieces(pieces);
                this.doSendMove(key, key, 'f');
            } else if (this.variant.pass && piece!.role === 'k-piece') {
                this.pass();
            }
        }
    }

    protected onUserMove(orig: cg.Key, dest: cg.Key, meta: cg.MoveMetadata) {
        this.preaction = meta.premove === true;

        const pieces = this.chessground.state.pieces;
        let moved = pieces[dest];
        // If the dest square is empty then the move is 960 castling
        if (moved === undefined) moved = { role: 'k-piece', color: this.mycolor } as cg.Piece;

        // remove en passant captured pawn manually since chessground doesn't know about en passant
        if (this.variant.enPassant && moved.role === "p-piece" && orig[0] != dest[0] && meta.captured === undefined) {
            const pos = util.key2pos(dest);
            const pawnPos: cg.Pos = [pos[0], pos[1] + (this.mycolor === 'white' ? -1 : 1)];
            const diff: cg.PiecesDiff = {};
            diff[util.pos2key(pawnPos)] = undefined;
            this.chessground.setPieces(diff);
            meta.captured = { role: "p-piece", color: util.opposite(this.mycolor) };
        }

        // increase pocket count
        if (this.variant.drop && meta.captured) {
            const role = unpromotedRole(this.variant, meta.captured);
            const color = util.opposite(meta.captured.color);
            this.pockets![color].pieces[role]!++;
            this.updatePocketView();
        }

        this.sendMove(orig, dest);

        this.preaction = false;
    }

    protected onUserDrop(role: cg.Role, dest: cg.Key, meta: cg.MoveMetadata) {
        this.preaction = meta.predrop === true;
        if (dropIsValid(this.dests, role, dest)) {
            this.pockets![this.mycolor].pieces[role]!--;
            this.updatePocketView();
            this.sendMove(role2san(role) + "@" as UCIOrig, dest);
        } else {
            this.clickDrop = undefined;
            this.chessground.set({
                fen: this.fullfen,
                lastMove: this.lastmove,
                turnColor: this.mycolor,
                movable: {
                    dests: this.dests,
                },
            });
        }
        this.preaction = false;
    }

    protected onMessage(evt) {
        const msg = JSON.parse(evt.data);
        if (msg.gameId !== this.gameId) return;
        switch (msg.type) {
            case "board": this.onMsgBoard(msg); break;
            case "crosstable": this.onMsgCtable(msg.ct, this.gameId); break
            case "game_user_connected": this.onMsgUserConnected(msg); break;
            case "spectators": this.onMsgSpectators(msg); break
            case "roundchat": this.onMsgChat(msg); break;
            case "fullchat": this.onMsgFullChat(msg); break;
            case "game_not_found": this.onMsgGameNotFound(msg); break;
            case "shutdown": this.onMsgShutdown(msg); break;
            case "logout": this.onMsgLogout(); break;
        }
    }

    protected abstract onMsgBoard(msg);

    protected onMsgCtable(ct, gameId) {
        if (ct !== "") {
            this.ctableContainer = patch(this.ctableContainer, h('div#ctable-container'));
            this.ctableContainer = patch(this.ctableContainer, crosstableView(ct, gameId));
        }
    }

    protected onMsgUserConnected(msg) {
        this.username = msg.username;
        // we want to know lastMove and check status
        this.doSend({ type: "board", gameId: this.gameId });
    }

    protected onMsgSpectators(msg) {
        const container = document.getElementById('spectators') as HTMLElement;
        patch(container, h('under-left#spectators', _('Spectators: ') + msg.spectators));
    }

    protected onMsgChat(msg) {
        if ((this.spectator && msg.room === 'spectator') || (!this.spectator && msg.room !== 'spectator') || msg.user.length === 0) {
            chatMessage(msg.user, msg.message, "roundchat");
        }
    }

    protected onMsgFullChat(msg) {
        // To prevent multiplication of messages we have to remove old messages div first
        patch(document.getElementById('messages') as HTMLElement, h('div#messages-clear'));
        // then create a new one
        patch(document.getElementById('messages-clear') as HTMLElement, h('div#messages'));
        msg.lines.forEach(line => {
            if ((this.spectator && line.room === 'spectator') || (!this.spectator && line.room !== 'spectator') || line.user.length === 0) {
                chatMessage(line.user, line.message, "roundchat");
            }
        });
    }

    protected onMsgGameNotFound(msg) {
        alert(_("Requested game %1 not found!", msg.gameId));
        window.location.assign(this.home);
    }

    protected onMsgShutdown(msg) {
        alert(msg.message);
    }

    protected onMsgLogout() {
        this.doSend({ type: "logout" });
    }

}
