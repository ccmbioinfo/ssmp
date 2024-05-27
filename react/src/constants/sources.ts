const SOURCES = (process.env.REACT_APP_SOURCE_LIST || '').split(',').map(v => v.trim());

export default SOURCES;
