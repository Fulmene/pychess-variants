import { VNode } from 'snabbdom/vnode';

import h from 'snabbdom/h';

import { Api } from 'chessgroundx/api';
import * as cg from 'chessgroundx/types';

import { _ } from './i18n';
import { IVariant, VARIANTS, BOARD_FAMILIES, PIECE_FAMILIES } from './chess';
import { changeBoardCSS, changePieceCSS } from './document';
import { ISettings, NumberSettings, BooleanSettings } from './settings';
import { slider, checkbox } from './view';

export interface IBoardController {
    readonly chessground: Api;

    readonly variant: IVariant;
    readonly mycolor: cg.Color;
    readonly oppcolor: cg.Color;
    readonly hasPockets: boolean;

    flip: boolean;

    autoQueen?: boolean;
    arrow?: boolean;
}

class BoardSettings {
    ctrl: IBoardController | undefined;
    settings: { [ key: string ]: ISettings<number | boolean> };

    constructor() {
        this.settings = {};
        this.settings["animation"] = new AnimationSettings(this);
        this.settings["showDests"] = new ShowDestsSettings(this);
        this.settings["autoQueen"] = new AutoQueenSettings(this);
        this.settings["arrow"] = new ArrowSettings(this);
        this.settings["blindfold"] = new BlindfoldSettings(this);
    }

    getSettings(settingsType: string, family: string = "") {
        const fullName = family + settingsType;
        if (!this.settings[fullName]) {
            switch (settingsType) {
                case "BoardStyle":
                    this.settings[fullName] = new BoardStyleSettings(this, family);
                    break;
                case "PieceStyle":
                    this.settings[fullName] = new PieceStyleSettings(this, family);
                    break;
                case "Zoom":
                    this.settings[fullName] = new ZoomSettings(this, family);
                    break;
                default:
                    throw "Unknown settings type " + settingsType;
            }
        }
        return this.settings[fullName];
    }

    updateBoardAndPieceStyles() {
        Object.keys(BOARD_FAMILIES).forEach(family => this.getSettings("BoardStyle", family).update());
        Object.keys(PIECE_FAMILIES).forEach(family => this.getSettings("PieceStyle", family).update());
    }

    updateCtrlBoardAndPieceStyle() {
        for (const k in this.settings)
            this.settings[k].update();
        const boardFamily = this.ctrl!.variant.board;
        const pieceFamily = this.ctrl!.variant.piece;
        this.getSettings("BoardStyle", boardFamily).update();
        this.getSettings("PieceStyle", pieceFamily).update();
        this.getSettings("Zoom", boardFamily).update();
    }

    view(variantName: string) {
        if (!variantName) return h("div#board-settings");
        const variant = VARIANTS[variantName];

        const settingsList : VNode[] = [];

        const boardFamily = VARIANTS[variantName].board;
        const pieceFamily = VARIANTS[variantName].piece;

        settingsList.push(this.settings["animation"].view());

        settingsList.push(this.settings["showDests"].view());

        if (variant.autoQueenable)
            settingsList.push(this.settings["autoQueen"].view());

        settingsList.push(this.settings["arrow"].view());

        settingsList.push(this.settings["blindfold"].view());

        if (variantName === this.ctrl?.variant.name)
            settingsList.push(this.getSettings("Zoom", boardFamily).view());

        settingsList.push(h('div#style-settings', [
            this.getSettings("BoardStyle", boardFamily).view(),
            this.getSettings("PieceStyle", pieceFamily).view(),
        ]));

        settingsList.push();

        return h('div#board-settings', settingsList);
    }
}

class AnimationSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('animation', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        this.boardSettings.ctrl?.chessground.set({ animation: { enabled: this.value } });
    }

    view(): VNode {
        return h('div', checkbox(this, 'animation', _("Piece animation")));
    }
}

class BoardStyleSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly boardFamily: string;

    constructor(boardSettings: BoardSettings, boardFamily: string) {
        super(boardFamily + '-board', 0);
        this.boardSettings = boardSettings;
        this.boardFamily = boardFamily;
    }

    update(): void {
        const idx = this.value;
        const board = BOARD_FAMILIES[this.boardFamily].boardCSS[idx];
        changeBoardCSS(this.boardFamily, board);
    }

    view(): VNode {
        const vboard = this.value;
        const boards : VNode[] = [];

        const boardCSS = BOARD_FAMILIES[this.boardFamily].boardCSS;
        for (let i = 0; i < boardCSS.length; i++) {
            boards.push(h('input#board' + i, {
                on: { change: evt => this.value = Number((evt.target as HTMLInputElement).value) },
                props: { type: "radio", name: "board", value: i },
                attrs: { checked: vboard === i },
            }));
            boards.push(h('label.board.board' + i + '.' + this.boardFamily, { attrs: { for: "board" + i } }, ""));
        }
        return h('settings-board', boards);
    }
}

class PieceStyleSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly pieceFamily: string;

    constructor(boardSettings: BoardSettings, pieceFamily: string) {
        super(pieceFamily + '-piece', 0);
        this.boardSettings = boardSettings;
        this.pieceFamily = pieceFamily;
    }

    update(): void {
        const idx = this.value;
        let css = PIECE_FAMILIES[this.pieceFamily].pieceCSS[idx];
        const ctrl = this.boardSettings.ctrl;
        const variant = ctrl?.variant;
        if (ctrl && variant && variant.piece === this.pieceFamily) {
            if (variant.sideDetermination === 'direction') {
                // change piece orientation according to board orientation
                if (ctrl.flip !== (ctrl.mycolor === "black")) // exclusive or
                    css = css.replace('0', '1');
            }

            // Redraw the piece being suggested for dropping in the new piece style
            if (ctrl.hasPockets) {
                const chessground = ctrl.chessground;
                const baseurl = variant.pieceBaseURL[idx] + '/';
                chessground.set({
                    drawable: {
                        pieces: { baseUrl: '/static/images/pieces/' + baseurl },
                    }
                });
                chessground.redrawAll();
            }
        }
        changePieceCSS(this.pieceFamily, css);
    }

    view(): VNode {
        const vpiece = this.value;
        const pieces : VNode[] = [];

        const pieceCSS = PIECE_FAMILIES[this.pieceFamily].pieceCSS;
        for (let i = 0; i < pieceCSS.length; i++) {
            pieces.push(h('input#piece' + i, {
                on: { change: e => this.value = Number((e.target as HTMLInputElement).value) },
                props: { type: "radio", name: "piece", value: i },
                attrs: { checked: vpiece === i },
            }));
            pieces.push(h('label.piece.piece' + i + '.' + this.pieceFamily, { attrs: { for: "piece" + i } }, ""));
        }
        return h('settings-pieces', pieces);
    }
}

class ZoomSettings extends NumberSettings {
    readonly boardSettings: BoardSettings;
    readonly boardFamily: string;

    constructor(boardSettings: BoardSettings, boardFamily: string) {
        super(boardFamily + '-zoom', 80);
        this.boardSettings = boardSettings;
        this.boardFamily = boardFamily;
    }

    update(): void {
        const ctrl = this.boardSettings.ctrl;
        const variant = ctrl?.variant;
        if (variant && variant.board === this.boardFamily) {
            const el = document.querySelector('.cg-wrap:not(.pocket)') as HTMLElement;
            if (el) {
                document.body.setAttribute('style', '--zoom:' + this.value);
                document.body.dispatchEvent(new Event('chessground.resize'));

                const baseWidth = el.getBoundingClientRect()['width'];
                const baseHeight = el.getBoundingClientRect()['height'];

                const pxw = `${baseWidth}px`;
                const pxh = `${baseHeight}px`;

                document.body.setAttribute('style', '--cgwrapwidth:' + pxw + '; --cgwrapheight:' + pxh + '; --zoom:' + this.value);

                /* TODO
                if (this.ctrl instanceof AnalysisController && !this.ctrl.embed) {
                    analysisChart(this.ctrl);
                }
                */
            }
        }
    }

    view(): VNode {
        return slider(this, 'zoom', 0, 100, this.boardFamily.includes("shogi") ? 1 : 1.15625);
    }
}

class ShowDestsSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('showDests', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        this.boardSettings.ctrl?.chessground.set({ movable: { showDests: this.value } });
    }

    view(): VNode {
        return h('div', checkbox(this, 'showDests', _("Show piece destinations")));
    }
}

class AutoQueenSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('autoqueen', false);
        this.boardSettings = boardSettings;
    }

    update(): void {
        const ctrl = this.boardSettings.ctrl;
        if (ctrl && "autoQueen" in ctrl)
            ctrl.autoQueen = this.value;
    }

    view(): VNode {
        return h('div', checkbox(this, 'autoqueen', _("Promote to Queen automatically")));
    }
}

class ArrowSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('arrow', true);
        this.boardSettings = boardSettings;
    }

    update(): void {
        const ctrl = this.boardSettings.ctrl;
        if (ctrl && "arrow" in ctrl)
            ctrl.arrow = this.value;
    }

    view(): VNode {
        return h('div', checkbox(this, 'arrow', _("Best move arrow in analysis board")));
    }
}

class BlindfoldSettings extends BooleanSettings {
    readonly boardSettings: BoardSettings;

    constructor(boardSettings: BoardSettings) {
        super('blindfold', false);
        this.boardSettings = boardSettings;
    }

    update(): void {
        const el = document.getElementById('mainboard') as HTMLInputElement;
        if (el) {
            if (this.value) {
                el.classList.add('blindfold');
            } else {
                el.classList.remove('blindfold');
            }
        }
    }

    view(): VNode {
        return h('div', checkbox(this, 'blindfold', _("Invisible pieces")));
    }
}

export const boardSettings = new BoardSettings();
