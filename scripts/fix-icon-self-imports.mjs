#!/usr/bin/env node
import fs from 'node:fs';

const files = [
  'packages/ui-web/src/FilePreviewDialog.tsx',
  'packages/ui-web/src/TaskRow.tsx',
  'packages/ui-web/src/AudioPlayerCard.tsx',
  'packages/ui-web/src/AudioRecorderDialog.tsx',
  'packages/ui-web/src/ExpenseCaptureDialog.tsx',
  'packages/ui-web/src/QuickReferenceView.tsx',
  'packages/ui-web/src/WorkspacePortabilityDialog.tsx',
  'packages/ui-mobile/src/MobileFilePreviewSheet.tsx',
  'packages/ui-mobile/src/MobileAudioPlayerCard.tsx',
  'packages/ui-mobile/src/MobileAudioRecorderSheet.tsx',
  'packages/ui-mobile/src/MobileCustomSectionEntrySheet.tsx',
  'packages/ui-mobile/src/MobileQuickReferenceView.tsx',
  'packages/ui-mobile/src/MobileWorkspacePortabilitySheet.tsx',
];

for (const f of files) {
  let t = fs.readFileSync(f, 'utf8');
  t = t.replace(/import \{ IconText, Icon \} from '@daynori\/ui-web';/g, "import { Icon } from './Icon.js';");
  t = t.replace(/import \{ Icon, IconText \} from '@daynori\/ui-web';/g, "import { Icon } from './Icon.js';");
  t = t.replace(/import \{ IconText, Icon \} from '@daynori\/ui-mobile';/g, "import { Icon } from './Icon.js';");
  t = t.replace(/import \{ Icon, IconText \} from '@daynori\/ui-mobile';/g, "import { Icon } from './Icon.js';");
  t = t.replace(/import \{ IconText \} from '\.\/Icon\.js';/g, "import { Icon } from './Icon.js';");
  t = t.replace(/import \{ Icon, IconText \} from '\.\/Icon\.js';/g, "import { Icon } from './Icon.js';");
  t = t.replace(/import \{ IconText, Icon \} from '\.\/Icon\.js';/g, "import { Icon } from './Icon.js';");
  if (/<IconText[\s/>]/.test(t)) {
    t = t.replace(/import \{ Icon \} from '\.\/Icon\.js';/g, "import { Icon, IconText } from './Icon.js';");
  }
  fs.writeFileSync(f, t);
  console.log('fixed', f);
}
