// Island entry for the Sikh Code dojos. Reads #i-dojo-mount[data-src], fetches
// the dojo JSON (synced to /data/institute/dojo/), and starts the right engine.

import { SikhCodeTerminal, type FileDef } from './terminal';
import { SikhCodeRepl, type DojoCommand } from './repl';

export async function initDojo(): Promise<void> {
  const el = document.getElementById('i-dojo-mount');
  if (!el) return;
  const src = el.dataset.src;
  if (!src) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let data: any;
  try {
    data = await fetch(src).then((r) => r.json());
  } catch {
    el.innerHTML =
      '<p class="i-mono" style="padding:28px;color:var(--i-muted)">The dojo could not load — refresh to try again.</p>';
    return;
  }

  if (data.engine === 'terminal') {
    new SikhCodeTerminal(el, {
      headerLabel: data.headerLabel,
      bootSteps: data.bootSteps,
      files: data.files as FileDef[],
      brandLine1: data.brandLine1,
      brandLine2: data.brandLine2,
      brandCaption: data.brandCaption,
      unitLabel: data.unitLabel,
      reducedMotion,
    });
  } else {
    new SikhCodeRepl(el, {
      headerLabel: data.headerLabel,
      welcomeTitle: data.welcomeTitle,
      welcomeLines: data.welcomeLines,
      footnote: data.footnote,
      commands: data.commands as DojoCommand[],
      demoList: data.demoList,
      modelLabel: data.modelLabel,
      reducedMotion,
    });
  }
}
