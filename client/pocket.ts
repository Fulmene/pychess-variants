import { h } from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import * as cg from 'chessgroundx/types';

import { IVariant, role2letter, letter2role } from './chess';
import { PieceRow } from './pieceRow';

export type Position = 'top' | 'bottom';

export class Pockets {
    white: Pocket;
    black: Pocket;

    constructor(white: Pocket, black: Pocket) {
        this.white = white;
        this.black = black;
    }

    toString() {
        return `[${this.white.toString()}${this.black.toString()}]`;
    }
};

export class Pocket extends PieceRow {
    pieces: { [role in cg.Role]?: number };

    constructor(variant: IVariant, color: cg.Color, position: Position, insertHook: (vnode: VNode) => void) {
        super(variant, color, position, insertHook);
        this.pieces = {};
        this.variant.pocketRoles(color)!.map(letter2role).forEach(role => this.pieces[role] = 0);
    }

    view() {
        const roles = Object.keys(this.pieces);
        return h(`div.pocket.${this.position}.usable`, {
            style: {
                '--pocketLength': String(roles.length),
                '--files': String(this.variant.boardWidth),
                '--ranks': String(this.variant.boardHeight),
            },
            hook: { insert: this.insertHook },
        }, roles.map(role => h(`piece.${role}.${this.color}`, {
            attrs: {
                'data-role': role,
                'data-color': this.color,
                'data-nb': this.pieces[role],
            },
        })));
    }

    toString() {
        const pocket = Object.keys(this.pieces)
            .map(role => role2letter(role as cg.Role).repeat(this.pieces[role]))
            .join('');
        return this.color === 'white' ? pocket.toUpperCase() : pocket;
    }

}

/*
export function drag(ctrl: BoardController, e: cg.MouchEvent): void {
    if (e.button !== undefined && e.button !== 0) return; // only touch or left click
    if (ctrl instanceof RoundController && ctrl.spectator) return;
    const el = e.target as HTMLElement,
        role = el.getAttribute('data-role') as cg.Role,
        color = el.getAttribute('data-color') as cg.Color,
        n = Number(el.getAttribute('data-nb'));
    if (!role || !color || !n) return;
    if (ctrl.clickDropEnabled && ctrl.clickDrop !== undefined && role === ctrl.clickDrop.role) {
        ctrl.clickDrop = undefined;
        ctrl.chessground.selectSquare(null);
        //cancelDropMode(ctrl.chessground.state);
        return;
    } else {
        //setDropMode(ctrl.chessground.state, number !== '0' ? { color, role } : undefined);
    }

    // Show possible drop dests on my turn only not to mess up predrop
    if (ctrl.clickDropEnabled && ctrl.turnColor === ctrl.mycolor) {
        const dropDests = { 'a0': ctrl.dests[role2san(role) + "@"] };
        // console.log("     new piece to a0", role);
        ctrl.chessground.newPiece({"role": role, "color": color}, 'a0')
        ctrl.chessground.set({
            turnColor: color,
            movable: {
                dests: dropDests,
            },
        });
        ctrl.chessground.selectSquare('a0');
        ctrl.chessground.set({ lastMove: ctrl.lastmove });
    }
    e.stopPropagation();
    e.preventDefault();
    dragNewPiece(ctrl.chessground.state, { color, role }, e);
}
*/
