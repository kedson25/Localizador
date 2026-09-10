const fs = require('fs');
const file = 'src/components/ToolsHub.tsx';
let code = fs.readFileSync(file, 'utf8');

// Add motion import
if (!code.includes("import { motion, AnimatePresence } from 'motion/react';")) {
  code = code.replace(
    "import { User } from '../lib/auth';",
    "import { User } from '../lib/auth';\nimport { motion, AnimatePresence } from 'motion/react';"
  );
}

// Backlog Section
const backlogStart = `{isBacklogOpen && (
          <div className="divide-y divide-gray-100">`;
const backlogEnd = `</div>
          </div>
        )}`;

// We need to match carefully because it's multiple lines. Let's use a smarter replace.
const oldBacklogBlock = `{isBacklogOpen && (
          <div className="divide-y divide-gray-100">`;

const newBacklogBlock = `<AnimatePresence initial={false}>
          {isBacklogOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-gray-100">`;

code = code.replace(oldBacklogBlock, newBacklogBlock);

// Replace the closing part of Backlog
const oldBacklogEnd = `</button>
              )}
            </div>
          </div>
        )}`;

const newBacklogEnd = `</button>
              )}
            </div>
          </div>
            </motion.div>
          )}
        </AnimatePresence>`;

code = code.replace(oldBacklogEnd, newBacklogEnd);

// Refugo Section
const oldRefugoBlock = `{isRefugoOpen && (
          <div className="divide-y divide-gray-100">`;

const newRefugoBlock = `<AnimatePresence initial={false}>
          {isRefugoOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-gray-100">`;

code = code.replace(oldRefugoBlock, newRefugoBlock);

const oldRefugoEnd = `</button>
              );
            })}
          </div>
        )}`;

const newRefugoEnd = `</button>
              );
            })}
          </div>
            </motion.div>
          )}
        </AnimatePresence>`;

code = code.replace(oldRefugoEnd, newRefugoEnd);

fs.writeFileSync(file, code);
console.log('Added drawer animations');
