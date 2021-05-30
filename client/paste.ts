import h from 'snabbdom/h';
import { VNode } from 'snabbdom/vnode';

import ffish = require('ffish');

import { _ } from './i18n';
import { variantsIni } from './variantsIni';
import { VARIANTS } from './chess';
import { parseKif, resultString } from './kif';

function importGame(model) {
    const e = document.getElementById("pgnpaste") as HTMLInputElement;
    console.log('PGN:', e.value);

    if (ffish) {
        ffish.loadVariantConfig(variantsIni);
        const XHR = new XMLHttpRequest();
        const FD  = new FormData();

        let mainlineMoves: string[] = [];

        try {
            const firstLine = e.value.slice(0, e.value.indexOf('\n'));

            // Fullwidth Colon(!) is used to separate game tag key-value pairs in Shogi KIF files :
            if (firstLine.includes('：') || firstLine.toUpperCase().includes('KIF')) {
                const kif = parseKif(e.value);
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
                const board = new ffish.Board('shogi', fen);

                for (let idx = 0; idx < moves.length; ++idx) {
                    const move = moves[idx];
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
                FD.append('Status', status);
                FD.append('final_fen', board.fen());
                FD.append('username', model['username']);

                board.delete();

            } else {

                const game = ffish.readGamePGN(e.value);

                const v = game.headers("Variant");
                const variant = v ? v.toLowerCase() : "chess";
                console.log("Variant:", variant);

                const f = game.headers("FEN");
                const initialFen = f ?? ffish.startingFen(variant);

                // TODO: crazyhouse960 but without 960? (export to lichess hack)
                const is960 = variant.includes("960") || variant.includes('random');

                const board = new ffish.Board(variant, initialFen, is960);

                mainlineMoves = game.mainlineMoves().split(" ");
                for (let idx = 0; idx < mainlineMoves.length; ++idx) {
                    board.push(mainlineMoves[idx]);
                }

                const tags = game.headerKeys().split(' ');
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
            if (this.readyState == 4 && this.status == 200) {
                const response = JSON.parse(this.responseText);
                if (response['gameId'] !== undefined) {
                    window.location.assign(model["home"] + '/' + response['gameId']);
                } else if (response['error'] !== undefined) {
                    alert(response['error']);
                }
            }
        };

        XHR.open("POST", "/import", true);
        XHR.send(FD);

    }
}

export function pasteView(model): VNode[] {
    return [ h('div.paste', [
        h('div.container', [
            h('strong', _('Paste the PGN text here')),
            h('textarea#pgnpaste', { attrs: { spellcheck: "false" } }),
            h('div.import', [
                h('button#import', { on: { click: () => importGame(model) } }, [
                    h('i.icon.icon-cloud-upload', _('IMPORT GAME'))
                ])
            ])
        ])
    ])];
}
