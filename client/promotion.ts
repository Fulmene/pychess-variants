import { init } from 'snabbdom';
import listeners from 'snabbdom/modules/eventlisteners';
import style from 'snabbdom/modules/style';

import { h } from 'snabbdom/h';
import { toVNode } from 'snabbdom/tovnode';

import { key2pos } from 'chessgroundx/util';
import * as cg from 'chessgroundx/types';

import { UCIOrig, UCIMove, uci2cg, letter2role, role2san } from './chess';
import { bind } from './document';
import { GameController } from './gameCtrl';

const patch = init([listeners, style]);

export class Promotion {
    ctrl: GameController;
    promoting: { color: cg.Color, orig: UCIOrig, dest: cg.Key } | undefined;
    choices: { [ role in cg.Role ]?: string };

    constructor(ctrl: GameController) {
        this.ctrl = ctrl;
        this.promoting = undefined;
        this.choices = {};
    }

    start(role: cg.Role, orig: UCIOrig, dest: cg.Key, autoQueen: boolean = false) {
        const ground = this.ctrl.chessground;
        // in 960 castling case (king takes rook) dest piece may be undefined
        if (ground.state.pieces[dest] === undefined) return false;

        const legalMoves = this.ctrl.ffishBoard.legalMoves().split(" ").
            map(uci2cg).
            filter(move => move.includes(orig+dest));

        if (legalMoves.length === 1 && legalMoves[0] === orig + dest) return false;

        const color = this.ctrl.turnColor;
        const orientation = ground.state.orientation;
        const pchoices = this.promotionChoices(role, legalMoves);

        this.choices = (autoQueen && 'q-piece' in pchoices) ? { 'q-piece': 'q' } : pchoices;

        this.promoting = {
            color: color,
            orig: orig,
            dest: dest,
        };

        if (Object.keys(this.choices).length === 1)
            this.finish(Object.keys(this.choices)[0] as cg.Role);
        else
            this.drawPromo(dest, color, orientation);

        return true;
    }

    private promotionChoices(role: cg.Role, legalMoves: UCIMove[]) {
        const choices = {};
        switch (this.ctrl.variant.promotion) {
            case 'kyoto':
                if (legalMoves[0].includes('@')) {
                    legalMoves.forEach(move => {
                        if (move[0] === '+')
                            choices['p' + role] = '+';
                        else
                            choices[role] = '';
                    });
                } else {
                    legalMoves.forEach(move => {
                        const promo = move.slice(4);
                        if (promo === '+')
                            choices['p' + role] = '+';
                        else
                            choices[role] = '-';
                    });
                }
                break;
            case 'shogi':
                legalMoves.forEach(move => {
                    const promo = move.slice(4);
                    if (promo)
                        choices['p' + role] = promo;
                    else
                        choices[role] = '';
                });
                break;
            default:
                legalMoves.forEach(move => {
                    const promo = move.slice(4);
                    if (promo)
                        choices[letter2role(promo)] = promo;
                    else
                        choices[role] = '';
                });
        }
        return choices;
    }

    private promote(dest: cg.Key, role: cg.Role, color: cg.Color) {
        const ground = this.ctrl.chessground;
        const pieces = {};
        pieces[dest] = {
            color: color,
            role: role,
            promoted: true
        };
        ground.setPieces(pieces);
    }

    private drawPromo(dest: cg.Key, color: cg.Color, orientation: cg.Color) {
        const container = toVNode(document.querySelector('extension') as Node);
        patch(container, this.view(dest, color, orientation));
    }

    private drawNoPromo() {
        const container = document.getElementById('extension_choice');
        if (container) patch(container, h('extension'));
    }

    private finish(role: cg.Role) {
        if (this.promoting) {
            this.drawNoPromo();
            this.promote(this.promoting.dest, role, this.promoting.color);

            const promo = this.choices[role]!;

            switch (this.ctrl.variant.promotion) {
                case 'kyoto':
                    this.ctrl.doSendMove(role2san(role) + "@" as UCIOrig, this.promoting.dest, '');
                    break;
                default:
                    this.ctrl.doSendMove(this.promoting.orig, this.promoting.dest, promo);
            }

            this.promoting = undefined;
        }
    }

    private cancel() {
        this.drawNoPromo();
        this.ctrl.goPly(this.ctrl.ply);
        return;
    }

    private view(dest: cg.Key, color: cg.Color, orientation: cg.Color) {
        const dim = this.ctrl.chessground.state.dimensions
        const pos = key2pos(dest);

        const leftFile = (orientation === "white") ? pos[0] - 1 : dim.width - pos[0];
        const left = leftFile * (100 / dim.width);

        const direction = color === orientation ? "top" : "bottom";

        const choices = Object.keys(this.choices);
        const topRank = Math.max(0, (color === "white") ? dim.height - pos[1] + 1 - choices.length : pos[1] - choices.length);

        return h("div#extension_choice." + direction, {
            hook: {
                insert: vnode => {
                    const el = vnode.elm as HTMLElement;
                    el.addEventListener("click", () => this.cancel());
                    el.addEventListener("contextmenu", e => {
                        e.preventDefault();
                        return false;
                    });
                }
            }
        },
            choices.map((role: cg.Role, i) => {
                const top = (color === orientation ? topRank + i : dim.height - 1 - topRank - i) * (100 / dim.height);
                return h("square", {
                    style: { top: top + "%", left: left + "%" },
                    hook: bind("click", e => {
                        e.stopPropagation();
                        this.finish(role);
                    }, false)
                },
                    [ h("piece." + role + "." + color) ]
                );
            })
        );
    }

}
