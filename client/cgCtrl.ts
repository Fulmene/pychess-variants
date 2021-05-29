import { init } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import * as cg from 'chessgroundx/types';
import { Chessground } from 'chessgroundx';
import { Api } from 'chessgroundx/api';
import { dragNewPiece } from 'chessgroundx/drag';

import Module from '../static/ffish.js';

import { IVariant, VARIANTS, getPockets, lc, role2letter } from './chess';
import { boardSettings, IBoardController } from './boardSettings';
import { Pocket, Pockets } from './pocket';

const patch = init([klass, attributes, properties, listeners, style]);

export abstract class ChessgroundController implements IBoardController {
    readonly home: string;

    chessground: Api;
    ffish: any;
    ffishBoard: any;

    readonly variant : IVariant;
    readonly chess960 : boolean;
    readonly hasPockets: boolean;
    readonly anon: boolean;
    mycolor: cg.Color;
    oppcolor: cg.Color;

    fullfen: string;
    flip: boolean;
    notation: cg.Notation;

    pockets?: Pockets;
    vpocket0?: VNode;
    vpocket1?: VNode;

    constructor(el, model) {
        this.home = model.home;

        this.variant = VARIANTS[model.variant];
        this.chess960 = model.chess960 === 'True';
        this.hasPockets = this.variant.pocket;
        this.anon = model.anon === 'True';
        this.mycolor = 'white';
        this.oppcolor = 'black';

        this.flip = false;

        if (this.hasPockets) {
            this.pockets = new Pockets(
                new Pocket(this, "white", "bottom"),
                new Pocket(this, "black", "top"),
            );
            this.vpocket0 = patch(document.getElementById('pocket0') as HTMLElement, this.pockets.black.view());
            this.vpocket1 = patch(document.getElementById('pocket1') as HTMLElement, this.pockets.white.view());
        }

        if (this.variant.name === 'janggi') { // TODO make this more generic / customisable
            this.notation = cg.Notation.JANGGI;
        } else {
            if (this.variant.name.endsWith("shogi") || this.variant.name === 'dobutsu' || this.variant.name === 'gorogoro') {
                this.notation = cg.Notation.SHOGI_HODGES_NUMBER;
            } else {
                this.notation = cg.Notation.SAN;
            }
        }

        this.chessground = Chessground(el, {
            variant: this.variant.name as cg.Variant,
            geometry: this.variant.geometry,
            notation: this.notation,
        });

        boardSettings.ctrl = this;
        boardSettings.updateCtrlBoardAndPieceStyle();

        Module().then(loadedModule => {
            console.log('Runtime Initialized');
            this.ffish = loadedModule;
            this.ffishBoard = new this.ffish.Board(this.variant.name, this.fullfen, this.chess960);
            console.log('Board Loaded', this.ffishBoard);
        });

    }

    toggleOrientation() {
        this.flip = !this.flip;
        this.chessground.toggleOrientation();

        if (this.variant.sideDetermination === 'direction')
            boardSettings.getSettings("PieceStyle", this.variant.piece).update();

        if (this.hasPockets) {
            if (this.pockets!.white.position === 'bottom') {
                this.pockets!.white.position = 'top';
                this.pockets!.black.position = 'bottom';
                this.vpocket0 = patch(this.vpocket0!, this.pockets!.white.view());
                this.vpocket1 = patch(this.vpocket1!, this.pockets!.black.view());
            } else {
                this.pockets!.white.position = 'bottom';
                this.pockets!.black.position = 'top';
                this.vpocket0 = patch(this.vpocket0!, this.pockets!.black.view());
                this.vpocket1 = patch(this.vpocket1!, this.pockets!.white.view());
            }
        }
    }

    updatePockets(fen: cg.FEN) {
        if (this.hasPockets) {
            const fenPocket = getPockets(fen);
            Object.keys(this.pockets!.white.pieces).forEach((role: cg.Role) => this.pockets!.white.pieces[role] = lc(fenPocket, role2letter(role), true));
            Object.keys(this.pockets!.black.pieces).forEach((role: cg.Role) => this.pockets!.black.pieces[role] = lc(fenPocket, role2letter(role), false));
            this.updatePocketView();
        }
    }

    updatePocketView() {
        if (this.hasPockets) {
            if (this.pockets!.white.position === 'top') {
                this.vpocket0 = patch(this.vpocket0!, this.pockets!.white.view());
                this.vpocket1 = patch(this.vpocket1!, this.pockets!.black.view());
            } else {
                this.vpocket0 = patch(this.vpocket0!, this.pockets!.black.view());
                this.vpocket1 = patch(this.vpocket1!, this.pockets!.white.view());
            }
        }
    }

    dragPocket(e: cg.MouchEvent) {
        if (e.button !== undefined && e.button !== 0) return; // only touch or left click
        const el = e.target as HTMLElement;
        const role = el.getAttribute('data-role') as cg.Role;
        const color = el.getAttribute('data-color') as cg.Color;
        const promoted = el.getAttribute('data-promoted') === 'true';
        const n = Number(el.getAttribute('data-nb'));

        if (!role || !color || !n) return;

        e.stopPropagation();
        e.preventDefault();
        dragNewPiece(this.chessground.state, { color, role, promoted }, e);
    }

    dropPocket(_e: cg.MouchEvent) {
        // Intentionally empty
    }

}
