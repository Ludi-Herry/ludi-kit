import { useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Popover,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Tag
} from "antd";
import {
  CheckCircleOutlined,
  CloseOutlined,
  DownOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  dashboardTimeRangeMeta,
  pushTaskStatusMeta,
  type DashboardCardDef,
  type DashboardCardId,
  type DashboardTimeRange,
  type PushTask
} from "../data";
import { deviceOpsStore, offlineAlertHasP1, useDeviceOpsState } from "../store";
import { AlertLevelText, appPath, useQueryParams, useRouter } from "../ui";
import "./dashboard.css";
import {
  cardTypeLabel,
  dashboardBadgeTone,
  dashboardCardCounts,
  dashboardCardsToAdd,
  dashboardCardQuery,
  dashboardCardState,
  dashboardDrawerGroups,
  dashboardEmptyBodyText,
  dashboardHint,
  deriveDashboardBoard,
  fusedTasksTopFive,
  metricUnit,
  openAlertsTopFive,
  parseDataState,
  parseDeniedPermissions,
  quickCardText,
  retrySearch,
  showDashboardGuide,
  topFiveCardIds,
  type DashboardBadgeTone,
  visibleCardDefs
} from "../core/dashboard";

// antd 角标色：core 的 high/mid/normal 语义档映射到本库色名（red/orange/blue）。
const DASHBOARD_BADGE_COLOR: Record<DashboardBadgeTone, string> = { high: "red", mid: "orange", normal: "blue" };

export function DashboardPage() {
  const { message } = App.useApp();
  const { navigate, pathname, search } = useRouter();
  const params = useQueryParams();
  const { alerts, devices, firmwareVersions, pushTasks, rmas, feedbackTickets, dashboard } = useDeviceOpsState();
  const { whole: wholeState, injected } = parseDataState(params.get("dataState"));
  const denied = parseDeniedPermissions(params.get("perm"));

  const [editing, setEditing] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<DashboardCardId[]>([]);

  // 无权限卡片不渲染也不占位：看板与可用库用同一份过滤结果。
  const visibleDefs = visibleCardDefs(denied);
  const board = deriveDashboardBoard(dashboard.orderedCardIds, visibleDefs);
  const counts = dashboardCardCounts({ alerts, devices, firmwareVersions, pushTasks, rmas, feedbackTickets, timeRange: dashboard.timeRange });

  const openAlertsFirstFive = useMemo(() => openAlertsTopFive(alerts), [alerts]);
  const fusedTasksFirstFive = useMemo(() => fusedTasksTopFive(pushTasks), [pushTasks]);
  const alertsP1 = offlineAlertHasP1(alerts);

  const hrefFor = (def: DashboardCardDef) => `${appPath(def.targetRoute)}${dashboardCardQuery(def)}`;

  const retry = () => {
    const query = retrySearch(search);
    navigate(`${appPath(pathname)}${query ? `?${query}` : ""}`);
  };

  const refreshAll = () => {
    deviceOpsStore.refreshDashboard();
    message.success("已刷新全部卡片");
  };

  const removeCard = (def: DashboardCardDef) => {
    const result = deviceOpsStore.removeDashboardCard(def.id);
    if (!result.ok) {
      message.error(result.reason);
      return;
    }
    const key = `dashboard-remove-${def.id}`;
    message.success({
      key,
      duration: 8,
      content: (
        <span>
          已移除「{def.name}」
          <Button
            onClick={() => {
              deviceOpsStore.undoRemoveDashboardCard();
              message.destroy(key);
            }}
            size="small"
            type="link"
          >
            撤销
          </Button>
        </span>
      )
    });
  };

  const moveCard = (fromIndex: number, toIndex: number) => {
    const result = deviceOpsStore.moveDashboardCard(fromIndex, toIndex);
    if (!result.ok) message.error(result.reason);
  };

  const joinSelected = () => {
    // 按注册表顺序依次加到看板末尾，维持确定性。
    const added = dashboardCardsToAdd(selected);
    for (const def of added) deviceOpsStore.addDashboardCardAt(def.id);
    message.success(added.length > 1 ? `已添加 ${added.length} 张卡片` : `已添加「${added[0]?.name}」`);
    setSelected([]);
    setDrawerOpen(false);
  };

  const toggleSelect = (id: DashboardCardId, checked: boolean) =>
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)));

  const renderTopFive = (def: DashboardCardDef) => {
    if (def.id === "offline-alerts") {
      return (
        <>
          <p className="dashboard-popover__title">Top 5 待处理告警</p>
          <ul className="dashboard-popover__items">
            {openAlertsFirstFive.map((alert) => (
              <li key={alert.id}>
                <a
                  className="dashboard-popover__item"
                  href={`${appPath("/alerts")}?alert=${encodeURIComponent(alert.id)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(`${appPath("/alerts")}?alert=${encodeURIComponent(alert.id)}`);
                  }}
                >
                  <span className="dashboard-popover__item-top">
                    <AlertLevelText level={alert.level} />
                    <span className="dashboard-popover__item-name">{alert.title}</span>
                  </span>
                  <span className="dashboard-popover__item-meta">首次发现 {alert.firstSeenAt}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      );
    }
    return (
      <>
        <p className="dashboard-popover__title">Top 5 已熔断任务</p>
        <ul className="dashboard-popover__items">
          {fusedTasksFirstFive.map((task: PushTask) => (
            <li key={task.id}>
              <a
                className="dashboard-popover__item"
                href={`${appPath("/system/firmware")}?tab=push-task&task=${encodeURIComponent(task.id)}`}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`${appPath("/system/firmware")}?tab=push-task&task=${encodeURIComponent(task.id)}`);
                }}
              >
                <span className="dashboard-popover__item-top">
                  <Tag color={pushTaskStatusMeta[task.status].color}>{pushTaskStatusMeta[task.status].label}</Tag>
                  <span className="dashboard-popover__item-name">{task.name}</span>
                </span>
                <span className="dashboard-popover__item-meta">
                  失败率 {task.failureRate}% · 创建 {task.createdAt.slice(0, 10)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </>
    );
  };

  const renderCard = (def: DashboardCardDef, index: number) => {
    const count = counts[def.id];
    const cardState = dashboardCardState(def.id, wholeState, injected);
    const badgeColor = DASHBOARD_BADGE_COLOR[dashboardBadgeTone(def, alertsP1)];
    const topFiveItems = def.id === "offline-alerts" ? openAlertsFirstFive : fusedTasksFirstFive;

    // 卡体内容在常态与编辑态共用：编辑态只看结构，不跳模块。
    const bodyContent =
      def.type === "quick" ? (
        <div className="dashboard-card__body">
          <div className="dashboard-quick">
            <span className="dashboard-quick__icon">
              <SearchOutlined aria-hidden="true" aria-label={undefined} />
            </span>
            <span className="dashboard-quick__text">{quickCardText[def.id] ?? "快捷入口"}</span>
          </div>
        </div>
      ) : def.type === "stat" ? (
        <div className="dashboard-card__body">
          <Statistic suffix="台" title={`${dashboardTimeRangeMeta[dashboard.timeRange]} 新激活`} value={count} />
        </div>
      ) : (
        <div className="dashboard-card__body">
          {count === 0 ? (
            <p className="dashboard-card__zero">{dashboardEmptyBodyText(def.type)}</p>
          ) : (
            <div>
              <span className="dashboard-card__metric">{count}</span>
              <span className="dashboard-card__metric-unit">{metricUnit[def.id]}</span>
            </div>
          )}
        </div>
      );

    if (editing) {
      return (
        <Card
          className={`dashboard-card dashboard-card--editing ${dragIndex === index ? "dashboard-card--dragging" : ""} ${overIndex === index && dragIndex !== null && dragIndex !== index ? "dashboard-card--over" : ""}`}
          data-card-id={def.id}
          draggable
          extra={
            <Space className="dashboard-card__edit" size={0}>
              <Button
                aria-label={`上移「${def.name}」`}
                disabled={index === 0}
                icon={<UpOutlined aria-hidden="true" aria-label={undefined} />}
                onClick={() => moveCard(index, index - 1)}
                size="small"
                type="text"
              />
              <Button
                aria-label={`下移「${def.name}」`}
                disabled={index === board.length - 1}
                icon={<DownOutlined aria-hidden="true" aria-label={undefined} />}
                onClick={() => moveCard(index, index + 1)}
                size="small"
                type="text"
              />
              <Button
                aria-label={`移除卡片「${def.name}」`}
                icon={<CloseOutlined aria-hidden="true" aria-label={undefined} />}
                onClick={() => removeCard(def)}
                size="small"
                type="text"
              />
            </Space>
          }
          key={def.id}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragOver={(event: DragEvent<HTMLElement>) => {
            if (dragIndex === null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setOverIndex(index);
          }}
          onDragStart={(event: DragEvent<HTMLElement>) => {
            setDragIndex(index);
            setOverIndex(null);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", def.id);
          }}
          onDrop={(event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            if (dragIndex !== null && dragIndex !== index) moveCard(dragIndex, index);
            setDragIndex(null);
            setOverIndex(null);
          }}
          title={
            <span className="dashboard-card__name">
              <HolderOutlined aria-hidden="true" aria-label={undefined} className="dashboard-card__drag" />
              {def.name}
            </span>
          }
          variant="outlined"
        >
          {cardState === "loading" ? <Skeleton active paragraph={{ rows: 1 }} /> : bodyContent}
        </Card>
      );
    }

    const activate = () => navigate(hrefFor(def));
    const onCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        activate();
      }
    };

    return (
      <Card
        aria-label={`进入「${def.name}」对应模块`}
        className="dashboard-card dashboard-card--clickable"
        data-card-id={def.id}
        extra={
          count > 0 && def.type !== "quick" ? <Badge color={badgeColor} count={count} overflowCount={99} /> : undefined
        }
        hoverable
        key={def.id}
        onClick={activate}
        onKeyDown={onCardKeyDown}
        role="link"
        tabIndex={0}
        title={def.name}
        variant="outlined"
      >
        {cardState === "error" ? (
          <Alert action={<Button onClick={(event) => { event.stopPropagation(); retry(); }} onKeyDown={(event) => event.stopPropagation()} size="small">重试</Button>} title="加载失败，点击重试" type="error" />
        ) : cardState === "loading" ? (
          <Skeleton active paragraph={{ rows: 1 }} />
        ) : (
          bodyContent
        )}
        {cardState === "ready" && (
          <footer className="dashboard-card__footer">
            <p className="dashboard-card__hint">{dashboardHint(def, alertsP1)}</p>
            {/* Top 5 浮层只对已定义明细的两张告警卡开放；SLA 超时卡的明细在目标列表查看。 */}
            {topFiveCardIds.includes(def.id) && topFiveItems.length > 0 && (
              <span className="device-ops-col-actions">
                <Popover content={<div className="dashboard-popover">{renderTopFive(def)}<p className="dashboard-popover__more"><a href={hrefFor(def)} onClick={(event) => { event.preventDefault(); navigate(hrefFor(def)); }}>查看全部</a></p></div>} placement="bottomLeft" trigger="click">
                  <Button onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} size="small" type="link">
                    Top 5
                  </Button>
                </Popover>
              </span>
            )}
          </footer>
        )}
      </Card>
    );
  };

  const showGuide = showDashboardGuide(wholeState, board.length);
  const drawerGroups = dashboardDrawerGroups(visibleDefs);

  return (
    <div className="device-ops-stack">
      <header className="device-ops-title-row">
        <div>
          <h1 className="device-ops-title">工作台</h1>
          <p className="dashboard-subtitle">今天需要处理的待办与告警，点卡片直达目标模块。</p>
        </div>
        <div className="dashboard-actions">
          <Segmented<DashboardTimeRange>
            aria-label="时间范围"
            onChange={(value) => deviceOpsStore.setDashboardTimeRange(value)}
            options={(Object.keys(dashboardTimeRangeMeta) as DashboardTimeRange[]).map((value) => ({ value, label: dashboardTimeRangeMeta[value] }))}
            value={dashboard.timeRange}
          />
          <span className="dashboard-refresh-time">上次刷新 {dashboard.lastRefreshedAt ? dashboard.lastRefreshedAt.slice(11) : "—"}</span>
          <Button icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={refreshAll} type="text">
            刷新全部
          </Button>
          {showGuide ? (
            <Button icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => setDrawerOpen(true)} type="primary">
              添加卡片
            </Button>
          ) : editing ? (
            <Space size={8}>
              <Button icon={<CheckCircleOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => setEditing(false)}>
                完成
              </Button>
              <Button icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => setDrawerOpen(true)} type="primary">
                添加卡片
              </Button>
            </Space>
          ) : (
            <Button icon={<EditOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => setEditing(true)}>
              编辑布局
            </Button>
          )}
        </div>
      </header>

      {wholeState === "error" ? (
        <Alert
          action={<Button onClick={retry} size="small">重试</Button>}
          description="工作台布局偏好暂时无法读取，请稍后重试；已保存的布局不会丢失。"
          title="工作台卡片加载失败"
          showIcon
          type="error"
        />
      ) : showGuide ? (
        <section aria-label="空工作台" className="device-ops-panel">
          <Empty description="你的工作台还是空的，点「编辑布局 → 添加卡片」挑选关注的待办">
            <Button icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />} onClick={() => setDrawerOpen(true)} type="primary">
              添加卡片
            </Button>
          </Empty>
        </section>
      ) : (
        <section aria-label="工作台卡片" className="dashboard-grid">
          {board.map((def, index) => renderCard(def, index))}
        </section>
      )}

      <Drawer
        footer={
          <Space>
            <Button onClick={() => { setDrawerOpen(false); setSelected([]); }}>取消</Button>
            <Button disabled={selected.length === 0} onClick={joinSelected} type="primary">
              加入所选{selected.length > 0 ? `（${selected.length}）` : ""}
            </Button>
          </Space>
        }
        onClose={() => { setDrawerOpen(false); setSelected([]); }}
        open={drawerOpen}
        size={480}
        title="添加卡片"
      >
        {drawerGroups.length === 0 ? (
          <Empty description="暂无可添加的卡片，当前账号没有对应模块的查看权限" />
        ) : (
          drawerGroups.map((group) => (
            <div className="dashboard-drawer__group" key={group.module}>
              <p className="dashboard-drawer__group-title">{group.module}</p>
              {group.defs.map((def) => {
                const onBoard = board.some((item) => item.id === def.id);
                const checked = onBoard || selected.includes(def.id);
                return (
                  <div className="dashboard-drawer__item" key={def.id}>
                    <Checkbox checked={checked} disabled={onBoard} onChange={(event) => toggleSelect(def.id, event.target.checked)}>
                      <span className="dashboard-drawer__name">{def.name}</span>
                    </Checkbox>
                    <span className="dashboard-drawer__tags">
                      <Space size={4}>
                        <Tag>{cardTypeLabel[def.type]}</Tag>
                        {onBoard && <Tag>已添加</Tag>}
                      </Space>
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </Drawer>
    </div>
  );
}
