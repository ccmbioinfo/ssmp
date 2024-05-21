const isCanonicalRegion = (chr: string) =>
    ['X', 'Y', ...Array.from({ length: 22 }, (_, i) => (i + 1).toString())].includes(chr);

export default isCanonicalRegion;
