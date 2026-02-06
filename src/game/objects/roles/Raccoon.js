import Unit from '../Unit';

export default class Raccoon extends Unit {
    constructor(scene, x, y, texture, team, targetGroup, stats, isLeader) {
        stats.role = 'Raccoon';
        super(scene, x, y, texture, team, targetGroup, stats, isLeader);
    }
}