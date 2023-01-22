import ffishModule, { FairyStockfish } from 'ffish-es6';

import { h, VNode } from 'snabbdom';

import { PyChessModel } from "@/common/pychess-variants";
import { _ } from '@/common/i18n';
import { variantsIni } from '@/common/variantsIni';
import { VARIANTS } from '@/chess/variants';
import { parseKif, resultString } from './kif';

const BRAINKING_SITE = '[Site "BrainKing.com (Prague, Czech Republic)"]';
const EMBASSY_FEN = '[FEN "rnbqkmcbnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKMCBNR w KQkq - 0 1"]';

export function pasteView(model: PyChessModel): VNode[] {
    let ffish: FairyStockfish;
    ffishModule().then((loadedModule: any) => {
        ffish = loadedModule;
    });

    return [ h('div.paste', [
        h('div.container', [
            h('strong', _('Paste the PGN text here')),
            h('textarea#pgnpaste', {attrs: {spellcheck: "false"}}),
            h('div.import', [
                h('button#import', {on: { click: () => importGame(model, ffish) }}, [
                    h('i', {class: {"icon": true, "icon-cloud-upload": true} }, _('IMPORT GAME'))
                ])
            ])
        ])
    ])];
}

const importGame = (model: PyChessModel, ffish: FairyStockfish) => {
    const e = document.getElementById("pgnpaste") as HTMLInputElement;
    //console.log('PGN:', e.value);
    let pgn = e.value;
    // Add missing Variant tag and switch short/long castling notations
    if (pgn.indexOf(BRAINKING_SITE) !== -1 && pgn.indexOf(EMBASSY_FEN) !== -1) {
        const lines = pgn.split(/\n/);

        // fix FEN
        const fenIndex = lines.findIndex((elem) => {return elem.startsWith('[FEN ');});
        lines[fenIndex] = `[FEN "${VARIANTS['embassy'].startFen}"]`;

        const variantIndex = lines.findIndex((elem) => {return elem.startsWith('[Variant ');});
        if (variantIndex < 0) {
            // add missing variant tag
            lines.splice(variantIndex, 0, '[Variant "Capablanca"]');
        } else {
            // change variant to Capa
            lines.splice(variantIndex, 1, '[Variant "Capablanca"]');
        }

        lines.forEach((line, idx) => {if (idx > fenIndex) lines[idx] = line.replace(/(O-O-O|O-O)/g, (match) => { return match === 'O-O' ? 'O-O-O' : 'O-O' });});
        pgn = lines.join('\n');
    }

    if (ffish) {
        ffish.loadVariantConfig(variantsIni);
        const XHR = new XMLHttpRequest();
        const FD  = new FormData();

        let variant, initialFen, board;
        let mainlineMoves: string[] = [];

        try {
            const firstLine = pgn.slice(0, pgn.indexOf('\n'));

            // Fullwidth Colon(!) is used to separate game tag key-value pairs in Shogi KIF files :
            if (firstLine.includes('：') || firstLine.toUpperCase().includes('KIF')) {
                const kif = parseKif(pgn);
                //console.log(kif['moves'].join(', '));
                const handicap = kif['handicap'];
                const moves = kif['moves'];
                let status = kif['status'];
                let result = kif['result'];
                const as = VARIANTS['shogi'].alternateStart;
                const isHandicap = (handicap !== '' && as![handicap] !== undefined);
                if (isHandicap) {
                    FD.append('FEN', as![handicap]);
                }

                const fen = (isHandicap) ? as![handicap] : VARIANTS['shogi'].startFen;
                board = new ffish.Board('shogi', fen);
                let move;

                for (let idx = 0; idx < moves.length; ++idx) {
                    move = moves[idx];
                    try {
                        board.push(move);
                        mainlineMoves.push(move);
                    }
                    catch (err) {
                        alert('Illegal move ' + move);
                        status = 10;
                        // LOSS for the moving player
                        result = resultString(false, idx + 1, isHandicap);
                        break;
                    }
                }

                FD.append('Variant', 'shogi');
                FD.append('Date', kif['date']);
                FD.append('White', kif['sente']);
                FD.append('Black', kif['gote']);
                FD.append('TimeControl', kif['tc']);
                FD.append('moves', mainlineMoves.join(' '));
                FD.append('Result', result);
                FD.append('Status', ""+status);
                FD.append('final_fen', board.fen());
                FD.append('username', model['username']);

                board.delete();

            } else {

                const game = ffish.readGamePGN(pgn);

                variant = "chess";
                const v = game.headers("Variant");
                //console.log("Variant:", v);
                if (v) variant = v.toLowerCase();

                initialFen = VARIANTS[variant].startFen;
                const f = game.headers("FEN");
                if (f) initialFen = f;

                // TODO: crazyhouse960 but without 960? (export to lichess hack)
                const is960 = variant.includes("960") || variant.includes('random');

                board = new ffish.Board(variant, initialFen, is960);

                mainlineMoves = game.mainlineMoves().split(" ");
                for (let idx = 0; idx < mainlineMoves.length; ++idx) {
                    board.push(mainlineMoves[idx]);
                }

                const tags = (game.headerKeys() as string).split(' ');
                tags.forEach((tag) => {
                    FD.append( tag, game.headers(tag) );
                });
                FD.append('moves', game.mainlineMoves());
                FD.append('final_fen', board.fen());
                FD.append('username', model["username"]);

                board.delete();
                game.delete();
            }
        }
        catch(err) {
            e.setCustomValidity(err.message ? _('Invalid PGN') : '');
            alert(err);
            return;
        }

        XHR.onreadystatechange = function() {
            if (this.readyState === 4 && this.status === 200) {
                const response = JSON.parse(this.responseText);
                if (response['gameId'] !== undefined) {
                    window.location.assign(model["home"] + '/' + response['gameId']);
                } else if (response['error'] !== undefined) {
                    alert(response['error']);
                }
            }
        };
        console.log(FD);
        XHR.open("POST", "/import", true);
        XHR.send(FD);
    }
}
