<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElConfigProvider,
  ElForm,
  ElFormItem,
  ElInput,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn
} from "element-plus";

type Row = Record<string, string | number | boolean | null>;
type Filter = { name: string; label: string; type: "text" | "select"; placeholder?: string; options?: { label: string; value: string }[] };
type PageAction = { label: string; kind: "refresh" | "backend" };

const pageTitle = "服务单";
const primaryAction = "新建服务单";
const secondaryActions: PageAction[] = [
  {
    "label": "刷新",
    "kind": "refresh"
  }
];
const filters: Filter[] = [
  {
    "name": "keyword",
    "label": "关键字",
    "type": "text",
    "placeholder": "服务单或客户"
  }
];
const columns: { key: string; title: string }[] = [
  {
    "key": "id",
    "title": "编号"
  },
  {
    "key": "customer",
    "title": "客户"
  },
  {
    "key": "owner",
    "title": "负责人"
  }
];
const rowKey = "id";
const rows: Row[] = [
  {
    "id": "TK-1001",
    "customer": "北岸实验室",
    "owner": "林师傅"
  },
  {
    "id": "TK-1002",
    "customer": "新桥仓储",
    "owner": "周师傅"
  },
  {
    "id": "TK-1003",
    "customer": "远航物流",
    "owner": "林师傅"
  },
  {
    "id": "TK-1004",
    "customer": "青禾食品",
    "owner": "陈师傅"
  },
  {
    "id": "TK-1005",
    "customer": "明泰医疗器械",
    "owner": "周师傅"
  },
  {
    "id": "TK-1006",
    "customer": "南湾冷链",
    "owner": "吴师傅"
  },
  {
    "id": "TK-1007",
    "customer": "汇川电子",
    "owner": "陈师傅"
  },
  {
    "id": "TK-1008",
    "customer": "北岸实验室",
    "owner": "吴师傅"
  },
  {
    "id": "TK-1009",
    "customer": "东港船务",
    "owner": "林师傅"
  },
  {
    "id": "TK-1010",
    "customer": "安和药业",
    "owner": "周师傅"
  },
  {
    "id": "TK-1011",
    "customer": "新桥仓储",
    "owner": "陈师傅"
  },
  {
    "id": "TK-1012",
    "customer": "云栈数据中心",
    "owner": "吴师傅"
  }
] as Row[];
const pageSize = 10;

const draft = reactive<Record<string, string>>(Object.fromEntries(filters.map((filter) => [filter.name, ""])));
const applied = ref<Record<string, string>>({ ...draft });
const currentPage = ref(1);
const feedback = ref("");

function matchesFilter(row: Row, filter: Filter, raw: string) {
  const term = raw.trim().toLocaleLowerCase();
  if (!term) return true;
  const values = columns.map((column) => String(row[column.key] ?? "").toLocaleLowerCase());
  if (filter.type === "select") {
    const label = (filter.options ?? []).find((option) => option.value === raw)?.label ?? raw;
    return values.some((value) => value === term || value === label.toLocaleLowerCase());
  }
  return values.some((value) => value.includes(term));
}

const filteredRows = computed(() =>
  rows.filter((row) => filters.every((filter) => matchesFilter(row, filter, applied.value[filter.name] ?? "")))
);
const pagedRows = computed(() => filteredRows.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize));

function applyQuery() {
  applied.value = { ...draft };
  currentPage.value = 1;
  feedback.value = "";
}

function resetQuery() {
  for (const filter of filters) draft[filter.name] = "";
  applyQuery();
}

function runAction(action: PageAction) {
  if (action.kind === "refresh") {
    currentPage.value = 1;
    feedback.value = `已刷新，当前共 ${filteredRows.value.length} 条。`;
    return;
  }
  feedback.value = `「${action.label}」需要连接后端服务后才能使用，当前尚未接入。`;
}

function runPrimaryAction() {
  feedback.value = `「${primaryAction}」需要连接后端服务后才能使用，当前尚未接入。`;
}
</script>

<template>
  <ElConfigProvider>
    <main class="generated-page">
      <header class="generated-native-header">
        <div>
          <h1>{{ pageTitle }}</h1>
          <p>筛选服务单并查看处理负责人。</p>
        </div>
        <div class="generated-header-actions">
          <ElButton v-for="action in secondaryActions" :key="action.label" @click="runAction(action)">{{ action.label }}</ElButton>
          <ElButton type="primary" @click="runPrimaryAction">{{ primaryAction }}</ElButton>
        </div>
      </header>
      <ElCard class="generated-block" shadow="never">
        <ElForm class="generated-filter-form" label-position="top" @submit.prevent="applyQuery">
          <ElFormItem v-for="filter in filters" :key="filter.name" :label="filter.label">
            <ElSelect v-if="filter.type === 'select'" v-model="draft[filter.name]" :placeholder="filter.placeholder" clearable>
              <ElOption v-for="option in filter.options" :key="option.value" :label="option.label" :value="option.value" />
            </ElSelect>
            <ElInput v-else v-model="draft[filter.name]" :placeholder="filter.placeholder" />
          </ElFormItem>
          <div class="generated-filter-actions">
            <ElButton @click="resetQuery">重置</ElButton>
            <ElButton type="primary" native-type="submit">查询</ElButton>
          </div>
        </ElForm>
      </ElCard>
      <ElCard class="generated-block" shadow="never">
        <div class="generated-data-toolbar">
          <span class="generated-count">共 {{ filteredRows.length }} 条</span>
          <span class="generated-feedback" role="status" aria-live="polite">{{ feedback }}</span>
        </div>
        <ElTable :data="pagedRows" :row-key="rowKey" aria-label="服务单队列">
          <ElTableColumn v-for="column in columns" :key="column.key" :prop="column.key" :label="column.title" />
          <template #empty>没有找到符合条件的记录，请调整条件后点击「查询」，或点击「重置」清空条件。</template>
        </ElTable>
        <ElPagination
          v-if="filteredRows.length > 0"
          v-model:current-page="currentPage"
          class="generated-pagination"
          layout="prev, pager, next"
          prev-text="上一页"
          next-text="下一页"
          :page-size="pageSize"
          :total="filteredRows.length"
        />
      </ElCard>
    </main>
  </ElConfigProvider>
</template>
