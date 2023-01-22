import Module, { FairyStockfish } from 'ffish-es6';

const VARIANTS_INI = '/static/variants.ini';
let ffish: FairyStockfish;
let variantsIni: string;

export async function loadVariantsIni(): Promise<string> {
    if (variantsIni === undefined) {
        const response = await fetch(VARIANTS_INI);
        variantsIni = await response.text();
    }
    return variantsIni;
}

export async function loadFFish(): Promise<FairyStockfish> {
    if (ffish === undefined) {
        ffish = await Module();
        ffish.loadVariantConfig(await loadVariantsIni());
    }
    return ffish;
}
