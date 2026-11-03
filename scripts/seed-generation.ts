import {createDatabaseClient} from "../src/lib/db/provider";

import { defaultTemplate } from "../src/features/generation/config";
const db = createDatabaseClient();
db.geoGenerationTemplate
  .upsert({
    where: { id: defaultTemplate.id },
    create: defaultTemplate,
    update: {},
  })
  .then(() =>
    console.log("默认生成模板已就绪；未创建或覆盖任何已核验参考资料。"),
  )
  .finally(() => db.$disconnect());
