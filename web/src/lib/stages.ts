export const stages = ['Discover', 'Explore', 'Practise', 'Deepen', 'Research'];
export const stageName = (level: number) => stages[Math.max(0, Math.min(4, Math.floor(level / 100) - 1))];
