/**
 * One-off: grants the Public role read access (find/findOne) on
 * product and librairie, matching what the v3 front-end needs.
 * Does NOT replicate the v3 public create/update/delete permissions,
 * which were overly permissive.
 */
const { compileStrapi, createStrapi } = require('@strapi/strapi');

async function run() {
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  try {
    const publicRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    const actions = [
      'api::product.product.find',
      'api::product.product.findOne',
      'api::librairie.librairie.find',
      'api::librairie.librairie.findOne',
    ];

    for (const action of actions) {
      const existing = await strapi
        .query('plugin::users-permissions.permission')
        .findOne({ where: { action, role: publicRole.id } });
      if (existing) continue;
      await strapi.documents('plugin::users-permissions.permission').create({
        data: { action, role: publicRole.id },
      });
    }
    console.log('Public read permissions enabled for product and librairie.');
  } finally {
    await strapi.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
