import { generateRoadLoop } from './backend/src/utils/geo';
generateRoadLoop(26.1878, 91.6916).then(res => console.log(res.length)).catch(console.error);
