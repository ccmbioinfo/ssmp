const resolveAssembly = (assembly: string) => (assembly.includes('38') ? '38' : '37');

export default resolveAssembly;
