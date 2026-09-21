/**
 * Let Node resolve the extensionless imports that app code actually uses.
 *
 * Metro resolves `./clockFormat` by trying `.ts`, `.tsx` and friends in turn.
 * Node's ESM loader does not — it wants the extension — so the moment a
 * tested module imported another one at runtime, the test failed to load with
 * ERR_MODULE_NOT_FOUND even though nothing was wrong with either file.
 *
 * The alternative was writing `./clockFormat.ts` throughout `app/`, which is
 * shipping code contorted to suit a test runner. This is the smaller price:
 * two short files confined to `test/`, making the runner resolve the way the
 * bundler the code is written for already does.
 */
import { register } from 'node:module';

register('./ts-resolve-hook.mjs', import.meta.url);
