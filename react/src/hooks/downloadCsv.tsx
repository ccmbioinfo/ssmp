import getKeys from '../utils/getKeys';

const objectToCsv = <T extends object>(data: T[]) => {
    const csvRows = [];
    const headers = getKeys(data[0]);
    csvRows.push(headers.join(','));

    for (const row of data) {
        const values = headers.map(header => {
            const escaped = row[header] ? ('' + row[header]).replace(/"/g, '\\"') : '';
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
};

const download = (data: BlobPart) => {
    const blob = new Blob([data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'ssmp.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

/**
 * @param rows The values of the table rows
 * @param headers A list of column ids that user wants to download
 */

const downloadCsv = <T extends object>(rows: T[], selectedHeaders: (keyof T)[]) => {
    const selectedRows = rows.map(r =>
        selectedHeaders.reduce((acc, curr) => ({ ...acc, ...{ [curr]: r[curr] } }), {})
    );

    const csvData = objectToCsv(selectedRows);
    download(csvData);
};

export default downloadCsv;
