import Module from '../static/ffish.js';

import { h, init } from 'snabbdom';
import { VNode } from 'snabbdom/vnode';
import klass from 'snabbdom/modules/class';
import attributes from 'snabbdom/modules/attributes';
import properties from 'snabbdom/modules/props';
import style from 'snabbdom/modules/style';
import listeners from 'snabbdom/modules/eventlisteners';

import * as cg from 'chessgroundx/types';

import { _ } from './i18n';
import { validFen, hasCastling, getPockets, unpromotedRole } from './chess';
import { ChessgroundController } from './cgCtrl';
import { PieceRow } from './pieceRow';
import { colorNames } from './profile';
import { copyBoardToPNG } from './png';
import { variantsIni } from './variantsIni';

const patch = init([klass, attributes, properties, style, listeners]);

export class EditorController extends ChessgroundController {
    private startFEN: cg.FEN;
    private parts: string[];
    private pocketsPart: string;

    constructor(el, model) {
        super(el, model);

        this.startFEN = model.fen;
        this.fullfen = this.startFEN;
        this.parts = this.fullfen.split(" ");
        this.pocketsPart = this.hasPockets ? getPockets(this.fullfen) : '';

        this.chessground.set({
            fen: this.parts[0],
            autoCastle: false,
            orientation: this.mycolor,
            movable: {
                free: true,
            },
            events: {
                change: () => this.onChangeBoard(),
            },
            selectable: {
                enabled: false
            },
            draggable: {
                deleteOnDropOff: true,
            },
        });

        const blackPieceRow = new PieceRow(this.variant, "black", "top", vnode => super.pocketInsertHook(vnode));
        const whitePieceRow = new PieceRow(this.variant, "white", "bottom", vnode => super.pocketInsertHook(vnode));
        patch(document.getElementById('pieces0') as HTMLElement, blackPieceRow.view());
        patch(document.getElementById('pieces1') as HTMLElement, whitePieceRow.view());

        patch(document.getElementById('fen') as HTMLElement,
            h('input#fen', {
                props: {
                    name: 'fen',
                    value: this.startFEN,
                },
                on: {
                    input: () => this.onChangeFEN(),
                    paste: e => this.onPasteFEN(e),
                },
                hook: {
                    insert: () => this.setStartPosition(),
                },
            }),
        );

        const dataIcon = 'icon-' + this.variant.name;
        const container = document.getElementById('editor-button-container') as HTMLElement;
        if (container) {
            const firstColor = colorNames(this.variant.firstColor);
            const secondColor = colorNames(this.variant.secondColor);
            const buttons = [
                h('div#turn-block', [
                    h('select#turn', {
                        props: { name: "turn" },
                        on: { change: e => this.onChangeTurn(e) },
                    }, [
                        h('option', { props: { value: 'white' } }, _('%1 to play', firstColor)),
                        h('option', { props: { value: 'black' } }, _('%1 to play', secondColor)),
                    ]),
                    (!hasCastling(this.variant, 'white')) ? '' :
                    h('strong', _("Castling")),
                    (!hasCastling(this.variant, 'white')) ? '' :
                    h('div.castling', [
                        h('label.OO', { attrs: { for: "wOO" } }, _("White") + " O-O"),
                        h('input#wOO', {
                            props: {name: "wOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('K')},
                            on: { change: () => this.onChangeCastling() },
                        }),
                        h('label.OOO', { attrs: { for: "wOOO" } }, "O-O-O"),
                        h('input#wOOO', {
                            props: {name: "wOOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('Q')},
                            on: { change: () => this.onChangeCastling() },
                        }),
                    ]),
                    (!hasCastling(this.variant, 'black')) ? '' :
                    h('div.castling', [
                        h('label.OO', { attrs: { for: "bOO" } }, _("Black") +  " O-O"),
                        h('input#bOO', {
                            props: {name: "bOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('k')},
                            on: { change: () => this.onChangeCastling() },
                        }),
                        h('label.OOO', { attrs: { for: "bOOO" } }, "O-O-O"),
                        h('input#bOOO', {
                            props: {name: "bOOO", type: "checkbox"},
                            attrs: {checked: this.parts[2].includes('q')},
                            on: { change: () => this.onChangeCastling() },
                        }),
                    ]),
                ]),

                h('a#clear.i-pgn', { on: { click: () => this.setEmptyBoard() } }, [
                    h('div', {class: {"icon": true, "icon-trash-o": true} }, _('CLEAR BOARD'))
                ]),
                h('a#start.i-pgn', { on: { click: () => this.setStartPosition() } }, [
                    h('div', {class: {"icon": true, [dataIcon]: true} }, _('STARTING POSITION'))
                ]),
                h('a#analysis.i-pgn', { on: { click: () => this.startAnalysis() } }, [
                    h('div', {class: {"icon": true, "icon-microscope": true} }, _('ANALYSIS BOARD'))
                ]),
                h('a#challengeAI.i-pgn', { on: { click: () => this.startChallenge() } }, [
                    h('div', {class: {"icon": true, "icon-bot": true} }, _('PLAY WITH MACHINE') + (this.anon ? _(' (must be signed in)') : ''))
                ]),
                h('a#pgn.i-pgn', { on: { click: () => copyBoardToPNG(this.parts.join(' ')) } }, [
                    h('div', {class: {"icon": true, "icon-download": true} }, _('EXPORT TO PNG'))
                ])
            ];
            patch(container, h('div.editor-button-container', buttons));
        }

        new (Module as any)().then(loadedModule => {
            this.ffish = loadedModule;
            if (this.ffish !== null) {
                this.ffish.loadVariantConfig(variantsIni);
                this.ffishBoard = new this.ffish.Board(this.variant.name, this.fullfen, this.chess960);
            }
        });
    }

    private setInvalid(invalid: boolean) {
        const analysis = document.getElementById('analysis') as HTMLElement;
        analysis.classList.toggle('disabled', invalid);

        const challenge = document.getElementById('challengeAI') as HTMLElement;
        challenge.classList.toggle('disabled', invalid || this.anon);

        const e = document.getElementById('fen') as HTMLInputElement;
        e.setCustomValidity(invalid ? _('Invalid FEN') : '');
    }

    private validFEN() {
        const fen = (document.getElementById('fen') as HTMLInputElement).value;
        const valid = validFen(this.variant, fen);
        const ff = this.ffish.validateFen(fen, this.variant.name);
        const ffValid = (ff === 1) || (this.variant.gate && ff === -5);
        return valid && ffValid;
    }

    private setJoinedParts() {
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.parts.join(' ');
        this.setInvalid(!this.validFEN());
    }

    private onChangeBoard() {
        this.chessground.set({ lastMove: [] });
        this.parts[0] = this.chessground.getFen() + (this.pockets?.toString() ?? '');
        this.setJoinedParts();
    }

    protected pocketInsertHook(vnode: VNode) {
        super.pocketInsertHook(vnode);
        const el = vnode.elm as HTMLElement;
        ['mouseup', 'touchend'].forEach(event => el.addEventListener(event, (e: cg.MouchEvent) => this.dropPocket(e)));
    }

    protected dragPocket(e: cg.MouchEvent) {
        super.dragPocket(e);
        const el = e.target as HTMLElement;
        const n = Number(el.getAttribute('data-nb'));
        if (n > 0) { // Subtract piece dragged from the pocket
            const role = el.getAttribute('data-role') as cg.Role;
            const color = el.getAttribute('data-color') as cg.Color;
            this.pockets![color].pieces[role]!--;
            this.updatePocketView();
            this.onChangeBoard();
        }
    }

    private dropPocket(e: cg.MouchEvent) {
        const el = e.target as HTMLElement;
        const piece = this.chessground.state.draggable.current?.piece;
        if (piece) {
            const role = unpromotedRole(this.variant, piece);
            const color = el.getAttribute('data-color') as cg.Color;
            const pocket = this.pockets![color];
            if (role in pocket.pieces) {
                pocket.pieces[role]!++;
                this.updatePocketView();
                this.onChangeBoard();
            }
        }
    }

    private onChangeFEN() {
        const fenEl = document.getElementById('fen') as HTMLInputElement;
        const fen = fenEl.value;
        this.parts = fen.split(' ');
        this.pocketsPart = getPockets(fen);
        this.chessground.set({ fen: fen });
        this.setInvalid(!this.validFEN());

        if (this.parts.length > 1) {
            const turn = document.getElementById('turn') as HTMLInputElement;
            turn.value = (this.parts[1] === 'w') ? 'white' : 'black';
        }

        this.fullfen = fen;
        this.updatePockets(fen);

        if (this.parts.length >= 3) {
            const castlings = {
                'K': 'wOO',
                'Q': 'wOOO',
                'k': 'bOO',
                'q': 'bOOO',
            }
            for (const key in castlings) {
                const el = document.getElementById(castlings[key]) as HTMLInputElement;
                if (el) el.checked = this.parts[2].includes(key);
            }
        }

    }

    private onPasteFEN(e) {
        // Trim the pasted text
        const data = e.clipboardData.getData('text');
        e.target.value = data.trim();
        e.preventDefault();
        this.onChangeFEN();
    }

    private onChangeTurn(e) {
        this.parts[1] = (e.target.value === 'white') ? 'w' : 'b';
        this.onChangeBoard();
    }

    private onChangeCastling() {
        const castlings = {
            'wOO': 'K',
            'wOOO': 'Q',
            'bOO': 'k',
            'bOOO': 'q',
        }
        const castle: string[] = [];
        for (const key in castlings) {
            const el = document.getElementById(key) as HTMLInputElement;
            if (el?.checked)
                castle.push(castlings[key]);
        }

        const gating = this.parts[2]?.match(/[A-H,a-h]/g) ?? [];

        this.parts[2] = castle.join('') + gating.join('');
        if (this.parts[2].length === 0) this.parts[2] = '~';
        this.onChangeBoard();
    }

    private setStartPosition() {
        const e = document.getElementById('fen') as HTMLInputElement;
        e.value = this.startFEN;
        this.onChangeFEN();
    }

    private setEmptyBoard() {
        const width = this.variant.boardWidth;
        const height = this.variant.boardHeight;

        const emptyPlacement = Array(height).fill(String(width)).join('/');
        this.pocketsPart = this.hasPockets ? '[]' : '';

        this.parts[0] = emptyPlacement + this.pocketsPart;
        this.parts[1] = 'w';
        this.parts[2] = '-';
        this.parts[3] = '-';
        this.parts[4] = '1';

        this.setJoinedParts();
        this.onChangeFEN();
    }

    private startAnalysis() {
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.home + '/analysis/' + this.variant.name + '?fen=' + fen);
    }

    private startChallenge() {
        const fen = this.parts.join('_').replace(/\+/g, '.');
        window.location.assign(this.home + '/@/Fairy-Stockfish/challenge/' + this.variant.name + '?fen=' + fen);
    }

}
