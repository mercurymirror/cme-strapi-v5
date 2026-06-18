/**
 * One-off migration script: copies data from the Strapi v3 Postgres DB
 * (classe-moyenne-strapi) into this Strapi v5 project.
 *
 * Usage: node scripts/migrate-from-v3.js
 */
const { Client } = require('pg');
const { compileStrapi, createStrapi } = require('@strapi/strapi');

const V3_DB = {
  host: '127.0.0.1',
  port: 5432,
  database: 'classe-moyenne-strapi',
  user: 'mac',
  password: '',
};

async function getProductFiles(v3, productId) {
  const { rows } = await v3.query(
    `select f.*, m.field, m."order"
     from upload_file_morph m
     join upload_file f on f.id = m.upload_file_id
     where m.related_id = $1 and m.related_type = 'products'
     order by m.field, m."order"`,
    [productId]
  );
  return rows;
}

async function createFile(strapi, fileCache, row) {
  if (fileCache.has(row.id)) return fileCache.get(row.id);
  const created = await strapi.documents('plugin::upload.file').create({
    data: {
      name: row.name,
      alternativeText: row.alternativeText,
      caption: row.caption,
      width: row.width,
      height: row.height,
      formats: row.formats,
      hash: row.hash,
      ext: row.ext,
      mime: row.mime,
      size: row.size,
      url: row.url,
      previewUrl: row.previewUrl,
      provider: row.provider,
      provider_metadata: row.provider_metadata,
      folderPath: '/',
    },
  });
  fileCache.set(row.id, created.id);
  return created.id;
}

async function run() {
  const v3 = new Client(V3_DB);
  await v3.connect();

  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  try {
    // --- Librairies ---
    const { rows: librairies } = await v3.query('select * from librairies order by id');
    for (const row of librairies) {
      await strapi.documents('api::librairie.librairie').create({
        data: { name: row.name, link: row.link },
        status: row.published_at ? 'published' : 'draft',
      });
    }
    console.log(`Librairies migrées: ${librairies.length}`);

    // --- Products (+ media) ---
    const { rows: products } = await v3.query('select * from products order by id');
    const fileCache = new Map();

    for (const row of products) {
      const files = await getProductFiles(v3, row.id);
      const byField = { image: [], image_hover: [], gallery: [] };
      for (const f of files) {
        if (byField[f.field]) byField[f.field].push(f);
      }

      const imageId = byField.image[0] ? await createFile(strapi, fileCache, byField.image[0]) : null;
      const imageHoverId = byField.image_hover[0]
        ? await createFile(strapi, fileCache, byField.image_hover[0])
        : null;
      const galleryIds = [];
      for (const f of byField.gallery) {
        galleryIds.push(await createFile(strapi, fileCache, f));
      }

      await strapi.documents('api::product.product').create({
        data: {
          title: row.title,
          price: row.price,
          slug: row.slug,
          status: row.status,
          New: row.New,
          author: row.author,
          description: row.description,
          description_en: row.description_en,
          year: row.year,
          size: row.size,
          medium: row.medium,
          technic: row.technic,
          pages: row.pages,
          copies: row.copies,
          publishing_date: row.publishing_date,
          Store_URL: row.Store_URL,
          design: row.design,
          image: imageId,
          image_hover: imageHoverId,
          gallery: galleryIds,
        },
      });
    }
    console.log(`Produits migrés: ${products.length}`);
    console.log(`Fichiers média migrés: ${fileCache.size}`);
  } finally {
    await v3.end();
    await strapi.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
