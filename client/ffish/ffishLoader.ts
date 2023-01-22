import Module, { FairyStockfish } from 'ffish-es6';

const VARIANTS_INI = '/static/variants.ini';
let ffish: FairyStockfish;
let variantsIniString: string;

export async function variantsIni(): Promise<string> {
    if (variantsIniString === undefined) {
        const response = await fetch(VARIANTS_INI);
        variantsIniString = await response.text();
    }
    return variantsIniString;
}

export async function ffishLoad(): Promise<FairyStockfish> {
    if (ffish === undefined) {
        ffish = await Module();
        ffish.loadVariantConfig(await variantsIni());
    }
    return ffish;
}
