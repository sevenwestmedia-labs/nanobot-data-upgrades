# Nanobots data upgrader

Nanobots is a library which helps you fix data and refactor your database in a safe, reliable way!

## Problems with breaking schema changes

There are a few problems with making a breaking schema change (like a rename), and many teams/companies just choose not to make them. This means your database cannot be refactored and evolved like you code, which can cause problems downt the track.

The general approach to deploying database migrations is run them _before_ the code is deployed, the rest of this readme assume this order in deployments.

### 1. Downtime

If you just rename a column, you will break the current deployed version of your application. To get around this you need to create your new column, then the new code needs to know if the data is in the old or the new column. If you did a bulk update you could avoid this issue, but you need to also stop your application if it does writes because it could write data in the old column after the bulk update is done

### 2. Bulk data upgrades causing locking/perf issues

If you do the bulk update, this may cause performance issues in your database because of writing to a large number of rows at the same time. It also may cause locking issues depending on your setup.

More info about the problems at https://medium.com/pixel-and-ink/making-changes-to-your-database-3f7f8629a175

## Related project

This project relies on https://github.com/sevenwestmedia-labs/node-knex-query-executor currently, though it wouldn't be hard to separate to make this stand alone.

## Usage

This example uses news articles as the domain.

### 1. All database types must extend `Schema_Shape`

Schema_Shape is an id column and an applied_upgrades column, this is the minimum this library needs to work against your data.

```ts
interface Schema_Article extends Schema_Shape {
    headline: string
    topics: string[]
    status: 'live' | 'dead'
    publicationDate: Date
    content: string
}
```

### 2. Wrap your raw DB types with a domain type

```ts
class Domain_Article {
    constructor(protected schema: Schema_Article) {}

    get id() {
        return this.schema.id
    }

    get headline() {
        return this.schema.headline
    }

    get topics() {
        return this.schema.topics
    }

    get status() {
        return this.schema.status
    }

    get publicationDate() {
        return this.schema.publicationDate
    }

    get content(): Domain_Block[] {
        return JSON.parse(this.schema.content).blocks
    }
}

type Domain_Block = Domain_Block_Text | Domain_Block_Image
interface Domain_Block_Text {
    kind: 'text'
    text: string
}
interface Domain_Block_Image {
    kind: 'image'
    src: string
    alt?: string
}
```

### 3. All application code should run against domain objects

The usage of https://github.com/sevenwestmedia-labs/node-knex-query-executor enforces this, all database query functions should return domain objects. This is crucial to ensure your application code always works against data which has all upgrades applied. When a row is fetched from the database, upgrades will be applied inline before returned from the query function.

### 4. Add update/upgrade functionality into domain objects

```ts
// Each object type should have an upgrade
interface ArticleUpgrade {
  upgradeName: string,
  upgrade: (article: Schema_Article) => Partial<Schema_Article>
}
const articleUpgrades: ArticleUpgrade[] = [upgradeContentColumn]

class Domain_Article {
    private updates: Partial<Schema_Article> | undefined

    /** Returns the current effective schema, with updates applied */
    protected get effectiveSchema() {
        return this.updates ? {
        ...this.schema,
        ...this.updates
        } : this.schema
    }

    constructor(protected schema: Schema_Article) {
        for (const upgrade of articleUpgrades) {
            if (this.effectiveSchema.applied_upgrades && this.effectiveSchema.applied_upgrades.includes(upgrade.upgradeName)) {
                continue
            }

            updates = upgrade.upgrade(this.effectiveSchema)
            updates.applied_upgrades = this.effectiveSchema.applied_upgrades
                ? [...this.effectiveSchema.applied_upgrades, upgrade.upgradeName]
                : [upgrade.upgradeName]
        }
    }

    get id() {
        return this.effectiveSchema.id
    }

    get headline() {
        return this.effectiveSchema.headline
    }

    get topics() {
        return this.effectiveSchema.topics
    }

    get status() {
        return this.effectiveSchema.status
    }

    get publicationDate() {
        return this.effectiveSchema.publicationDate
    }

    get content(): Domain_Block[] {
        return this.effectiveSchema.content2.blocks
    }

    update(updateFn: (article: Domain_Article) => Partial<Schema_Article>) {
        this.updates = this.updates ? { ...this.updates, ...updateFn(this) } : updateFn(this)
    }
```

### 5. Setup data upgrader

You can create a data upgrader which supports as many tables as you want. It will go through each table, one by one, then apply each data upgrade to each row in batches.

```ts
import { createDataUpgrader } from './data-upgrader'
import {
    articleDataUpgrades,
    articleDataUpgradeCleanups,
} from 'api/src/domain/domain-article'
import { getArticlesWithUpgradeApplied } from 'api/src/queries/article/get-articles-with-upgrades-applied-query'
import { getArticlesWithoutUpgradeApplied } from 'api/src/queries/article/get-articles-without-upgrades-applied-query'
import { updateArticleQuery } from 'api/src/queries/article/update-article-query'

/** Your application creates a data upgrader for each of the tables you want to set it up for */
export const dataUpgrader = createDataUpgrader(
    ['article'],
    {
        upgradesToRun: {
            article: articleDataUpgrades,
        },
        upgradesToCleanup: {
            article: articleDataUpgradeCleanups,
        },
        batchSizeOverrides: {},
        services: {
            article: {
                getWithUpgradesApplied: getArticlesWithUpgradeApplied,
                getWithoutUpgradesApplied: getArticlesWithoutUpgradeApplied,
                updateQuery: updateArticleQuery,
            },
        },
    },
    {
        // Small batches for the demo
        batchSize: 5,
        cleanupBatchSize: 5,
    },
)
```
