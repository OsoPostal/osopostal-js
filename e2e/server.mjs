// Levanta el mock de la API (4010) y sirve packages/widget (5173) para el E2E.
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../scripts/serve.mjs';
import { createMockApi } from './mock-api.mjs';

const widget = fileURLToPath(new URL('../packages/widget', import.meta.url));

createMockApi().listen(4010, () => console.log('Mock API en http://localhost:4010/v1'));
createStaticServer(widget).listen(5173, () => console.log('Demo en http://localhost:5173/demo/'));
