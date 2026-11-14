/**
 * Safety guard for development scripts that change data or passwords.
 *
 * There is only one Firebase project, so these scripts would act on LIVE data. They refuse to
 * run unless explicitly allowed:   ALLOW_DEV_SCRIPTS=yes npx ts-node src/scripts/<script>.ts
 * and never when NODE_ENV=production.
 *
 * Import this FIRST in every such script.
 */
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEV_SCRIPTS !== 'yes') {
    console.error(
        '⛔ Refusing to run: this script modifies live data.\n' +
        '   Set ALLOW_DEV_SCRIPTS=yes (and NODE_ENV not "production") if you really intend to run it.'
    );
    process.exit(1);
}

export {};
