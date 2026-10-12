// CMDLAB's personal bot names must not appear in anything BUD ships or publishes (the .ehpk bundle, store copy,
// docs, Worker responses). The list is stored only as SHA-256 hashes so the names themselves are not in the
// repo either. Matching: case-insensitive whole words (runs of letters), names of 1-4 words; one entry is
// case-sensitive ("cs:" prefix, a two-letter all-caps name that would otherwise match minified identifiers).
// To add a name: node -e "console.log(require('crypto').createHash('sha256').update('<name>'.toLowerCase()).digest('hex'))"
// Used by check-ehpk-urls.mjs (release build) and check-names.mjs (repo, part of npm test).
import { createHash } from 'node:crypto';

export const NAME_HASHES = new Set([
  '4cfbf05e4493d17167dbd8ae46b1248d3f3b41ff517bcf60b25bff8a5b206f8c',
  '29d8422fdd68cdd0e11753622ad7e67f53215ab8fce986f298957411ccde4617',
  '8cbbcf29d9cef89675c5f5c1dcfe827d0570416a5aaba30dd0de159661ad905b',
  '71b41d6dd48dc58eba8f5cf9edf30fef6597fdf285a521bb8fcbad4b3d50887d',
  '19aa8c53de7a9fb7e5803482b299825966f91643e964496a44eb3a77c59157d9',
  '3608e4bd0e693177369e17f48cdf750eb962b86aaac1bf6b50c7a46d52f7d94b',
  '3ed58504bfc045320e24aaca78ed83508f961fdd7a2dd561ce85799fb357a2db',
  '1a79668eac4051a9128b81c116007d1b41ce17828d7722afc9746699f4e817b8',
  '0736fd5b7cc7ab7dfe821d3a17f93f2634497770232486155c9c881321c4d22c',
  '93dbf6365e4f609a767e1a0d7e9de3b3e31deece8ffd2d282a149dd089ffeb05',
  '9e66a118b9a0fb8cada5eb0f357806a21cc067fa4b9d9f76eb9773a24e022438',
  '5e05cb515b5e6aee84325a8ceeb28a92c2d8d01c6b0f4bb0e743bd04ece7557e',
  'ae1cbbea51d850315cbe6c5f429bc8c23f2bda147e4a194b13f2ebc3901958f3',
  '7029e8d6c9a2801f4494ce7e1b969560c447aebd6843c298d5dba4bba628cba1',
  'fa32ea1aca970a81be4d917171bd10bea83a02f33529e585364a2b1b308ff1f0',
  '5944ae849448011ca08c3785f1de1a54c8a96d6c23f787f9d962b624edd4151d',
  '94aec9fbed989ece189a7e172c9cf41669050495152bc4c1dbf2a38d7fd85627',
  'ded928c12bdf61f7b3ed8cc9bc60e0f28b61ab35a8d9afa263884fb832cfa596',
  'ef7ff60507959a8efe9c53ee59f0a8352760d63b28e6de05c7fb0b16ffc4e23f',
  '77f1d1c04d32a84a569b4aed05ef453ec4f464fcac98de97bb2f5033df2c4a04',
  '93b5ff16dcf99c0a777d61bde95d9d836349c2a23df05c5f0caa79b77d9c70f5',
  'a1c509df21cec49af6685ab8e3dbad60dfcb037cc0ab3b0b52c612f2ae6ecca4',
  '09c1755b6a8b227e811e931cb5a59dd381847e8a7762d54b75f452185c7adc67',
  '2f3dcd0c3793c253a6e2d7dec3359c4ba1d5c905a2096c9b644941c40d050c25',
  '06a0fc2cf5cdeabfc6a602aac50110c24654b3d80b15f8c00fa52596de8e6088',
  '8a496953e8428805c2129e52ba04525d4d7d1cd94b7a6475183df8b42d67eed7',
]);
const sha = s => createHash('sha256').update(s).digest('hex');

/** Hash ids (first 8 hex chars) of personal names found in text. Never returns the matched text. */
export function findNames(text) {
  const words = text.match(/[A-Za-z]+/g) || [];
  const hits = new Set();
  for (let i = 0; i < words.length; i++) {
    let phrase = '';
    for (let n = 0; n < 4 && i + n < words.length; n++) {
      phrase = n ? `${phrase} ${words[i + n].toLowerCase()}` : words[i].toLowerCase();
      const h = sha(phrase);
      if (NAME_HASHES.has(h)) hits.add(h.slice(0, 8));
    }
    const cs = sha(`cs:${words[i]}`);
    if (NAME_HASHES.has(cs)) hits.add(cs.slice(0, 8));
  }
  return [...hits];
}
