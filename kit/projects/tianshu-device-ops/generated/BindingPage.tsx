import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Result,
  Skeleton,
  Space,
  Table,
  Tooltip,
  Typography
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { maskPhone, type AppUser, type Binding, type BindingRole, type Device } from "../data";
import { deviceOpsStore, useDeviceOpsState } from "../store";
import {
  AccountStatusTag,
  OnlineTag,
  appPath,
  returnUrlFrom,
  safeReturnTo,
  useDataState,
  usePermission,
  useQueryParams,
  useRouter
} from "../ui";
import {
  BINDING_ANCHOR_DAY,
  BIND_TABLE_PAGE_SIZE,
  executeBindingLookup,
  feedbackCreateSearch,
  isLongInactive,
  searchFieldStates,
  searchTargetFromInputs,
  showBindingPagination
} from "../core/binding";
import "./binding.css";

type QueryTarget =
  | { type: "phone"; value: string }
  | { type: "userId"; value: string }
  | { type: "sn"; value: string };

type SearchResult =
  | { status: "idle" }
  | { status: "not_found" }
  | { status: "sn_zero_bound"; sn: string }
  | { status: "mode_a"; user: AppUser; boundDevices: { binding: Binding; device?: Device }[] }
  | { status: "mode_b"; sn: string; bindings: { binding: Binding; user?: AppUser }[] };

export function BindingPage() {
  const { message } = App.useApp();
  const { navigate, pathname, search } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly } = usePermission();
  const { appUsers, bindings, devices } = useDeviceOpsState();

  const returnTo = safeReturnTo(params.get("from"));
  const currentUrl = returnUrlFrom(pathname, search);

  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState("");
  const [sn, setSn] = useState("");
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState<QueryTarget | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResult>({ status: "idle" });

  const [sensitiveModalOpen, setSensitiveModalOpen] = useState(false);
  const [auditReason, setAuditReason] = useState("");
  const [revealedUserIds, setRevealedUserIds] = useState<Set<string>>(() => new Set());

  const {
    phoneDisabled: isPhoneDisabled,
    userIdDisabled: isUserIdDisabled,
    snDisabled: isSnDisabled,
    searchDisabled: isSearchDisabled
  } = searchFieldStates({ phone, userId, sn });

  const runQuery = (target: QueryTarget) => {
    setLastQuery(target);
    setIsQueryLoading(true);
    const timer = setTimeout(() => {
      const res = executeBindingLookup(target, { appUsers, bindings, devices });
      setSearchResult(res);
      setIsQueryLoading(false);
    }, 120);
    return () => clearTimeout(timer);
  };

  useEffect(() => {
    const urlSn = params.get("sn");
    const urlUserId = params.get("user_id") || params.get("userId");
    const urlPhone = params.get("phone");

    if (urlSn) {
      const val = urlSn.trim();
      setSn(val);
      setPhone("");
      setUserId("");
      return runQuery({ type: "sn", value: val });
    }
    if (urlUserId) {
      const val = urlUserId.trim();
      setUserId(val);
      setPhone("");
      setSn("");
      return runQuery({ type: "userId", value: val });
    }
    if (urlPhone) {
      const val = urlPhone.trim();
      setPhone(val);
      setUserId("");
      setSn("");
      return runQuery({ type: "phone", value: val });
    }

    // 默认展示典型用户 U100014 及其多台绑定设备，避免初次进入空屏
    const defaultUser = "U100014";
    setUserId(defaultUser);
    setPhone("");
    setSn("");
    return runQuery({ type: "userId", value: defaultUser });
  }, [params.get("sn"), params.get("user_id"), params.get("userId"), params.get("phone")]);

  const handleSearch = () => {
    const result = searchTargetFromInputs({ phone, userId, sn });
    if (result.kind === "none") return;
    if (result.kind === "invalid") {
      message.warning(result.warning);
      return;
    }
    runQuery(result.target);
  };

  const handleRetry = () => {
    if (dataState === "error") {
      const next = new URLSearchParams(search);
      next.delete("dataState");
      const nextSearch = next.toString();
      navigate(`${appPath(pathname)}${nextSearch ? `?${nextSearch}` : ""}`);
    }
    if (lastQuery) {
      runQuery(lastQuery);
    }
  };

  const activeUser = searchResult.status === "mode_a" ? searchResult.user : null;
  const isPhoneRevealed = activeUser ? revealedUserIds.has(activeUser.userId) : false;

  const handleConfirmReveal = () => {
    if (!activeUser || !auditReason.trim()) return;
    const res = deviceOpsStore.revealSensitiveField({
      targetUserId: activeUser.userId,
      field: "手机号",
      reason: auditReason.trim()
    });
    if (res.ok) {
      message.success(res.message || "已记录审计日志");
      setRevealedUserIds((prev) => new Set(prev).add(activeUser.userId));
      setSensitiveModalOpen(false);
      setAuditReason("");
    } else {
      message.error(res.reason || "查看失败");
    }
  };

  const handleCreateFeedback = () => {
    if (readonly || !activeUser) return;
    const firstSn = searchResult.status === "mode_a" ? searchResult.boundDevices[0]?.binding.sn : undefined;
    const query = feedbackCreateSearch({ user: activeUser, firstSn, fromUrl: currentUrl });
    navigate(`${appPath("/exceptions/feedback")}?${query}`);
  };

  const renderResultArea = () => {
    if (dataState === "loading" || isQueryLoading) {
      return (
        <section aria-label="加载中" className="device-ops-panel binding-state-panel">
          <Skeleton active paragraph={{ rows: 6 }} />
        </section>
      );
    }

    if (dataState === "error") {
      return (
        <section aria-label="查询错误" className="device-ops-panel binding-state-panel">
          <Alert
            type="error"
            showIcon
            title="查询失败"
            description="查询失败：网络异常或服务暂时不可用，请稍后重试"
            action={
              <Button size="small" onClick={handleRetry}>
                重试
              </Button>
            }
          />
        </section>
      );
    }

    if (dataState === "empty") {
      return (
        <section aria-label="无结果" className="device-ops-panel binding-state-panel">
          <Empty description="未查询到匹配的用户或设备绑定记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </section>
      );
    }

    if (searchResult.status === "idle") {
      return (
        <section aria-label="未检索" className="device-ops-panel binding-state-panel">
          <Empty description="请输入完整手机号 / 用户 ID / SN 后查询，不支持无条件浏览" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </section>
      );
    }

    if (searchResult.status === "not_found") {
      return (
        <section aria-label="未查询到记录" className="device-ops-panel binding-state-panel">
          <Empty description="未查询到匹配的用户或设备绑定记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </section>
      );
    }

    if (searchResult.status === "sn_zero_bound") {
      return (
        <section aria-label="设备暂无绑定用户" className="device-ops-panel binding-state-panel">
          <Empty description="该设备暂无绑定用户" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </section>
      );
    }

    if (searchResult.status === "mode_a") {
      const { user, boundDevices } = searchResult;
      return (
        <div className="device-ops-stack">
          <section aria-label="用户基本信息" className="device-ops-panel binding-user-panel">
            <div className="binding-panel-head">
              <h2 className="binding-panel-title">用户基本信息</h2>
              <div className="binding-panel-actions">
                {readonly ? (
                  <Tooltip title="无客户反馈新建权限">
                    <span className="device-ops-guard">
                      <Button disabled>为该用户新建客户反馈工单</Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button onClick={handleCreateFeedback}>为该用户新建客户反馈工单</Button>
                )}
              </div>
            </div>
            <Descriptions
              column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}
              size="middle"
              items={[
                {
                  key: "userId",
                  label: "用户 ID",
                  children: (
                    <Typography.Text
                      copyable={{
                        text: user.userId,
                        tooltips: ["复制用户 ID", "已复制"],
                        onCopy: () => message.success("已复制")
                      }}
                    >
                      {user.userId}
                    </Typography.Text>
                  )
                },
                {
                  key: "phone",
                  label: "手机号",
                  children: (
                    <Space size="middle">
                      <span className="binding-phone-text">
                        {isPhoneRevealed ? user.phone : maskPhone(user.phone)}
                      </span>
                      {!isPhoneRevealed && (
                        readonly ? (
                          <Tooltip title="无敏感字段查看权限">
                            <span className="device-ops-guard">
                              <Button size="small" type="link" disabled className="binding-reveal-btn">
                                查看完整
                              </Button>
                            </span>
                          </Tooltip>
                        ) : (
                          <Button
                            size="small"
                            type="link"
                            className="binding-reveal-btn"
                            onClick={() => setSensitiveModalOpen(true)}
                          >
                            查看完整
                          </Button>
                        )
                      )}
                    </Space>
                  )
                },
                {
                  key: "registeredAt",
                  label: "注册时间",
                  children: user.registeredAt
                },
                {
                  key: "appVersion",
                  label: "App 版本",
                  children: user.appVersion
                },
                {
                  key: "lastActiveAt",
                  label: "最后活跃时间",
                  children: (
                    <span>
                      {user.lastActiveAt}
                      {isLongInactive(user.lastActiveAt, BINDING_ANCHOR_DAY) && (
                        <span className="device-ops-muted binding-inactive-note">（长期未活跃）</span>
                      )}
                    </span>
                  )
                },
                {
                  key: "accountStatus",
                  label: "账号状态",
                  children: <AccountStatusTag value={user.accountStatus} />
                }
              ]}
            />
          </section>

          <section aria-label="绑定设备" className="device-ops-panel device-ops-panel--table binding-devices-panel">
            <div className="device-ops-toolbar">
              <span className="device-ops-toolbar__count">
                绑定设备（共 <strong className="device-ops-num">{boundDevices.length}</strong> 台）
              </span>
            </div>
            <Table
              rowKey={(row) => row.binding.sn}
              dataSource={boundDevices}
              scroll={{ x: "max-content" }}
              columns={[
                {
                  title: "SN",
                  dataIndex: ["binding", "sn"],
                  key: "sn",
                  render: (_val, record) => {
                    const devSn = record.binding.sn;
                    if (readonly) {
                      return (
                        <Tooltip title="当前账号无数字护照查看权限">
                          <span className="device-ops-locked">{devSn}</span>
                        </Tooltip>
                      );
                    }
                    return (
                      <a href={`${appPath("/lifecycle/passport")}?sn=${encodeURIComponent(devSn)}&from=${encodeURIComponent(currentUrl)}`}>
                        {devSn}
                      </a>
                    );
                  }
                },
                {
                  title: "机型",
                  key: "model",
                  render: (_val, record) => record.device?.model ?? "—"
                },
                {
                  title: "绑定角色",
                  dataIndex: ["binding", "role"],
                  key: "role",
                  render: (role: BindingRole) =>
                    role === "owner" ? (
                      <strong className="binding-role-owner">管理员</strong>
                    ) : (
                      <span className="binding-role-member">成员</span>
                    )
                },
                {
                  title: "绑定时间",
                  dataIndex: ["binding", "boundAt"],
                  key: "boundAt",
                  sorter: (a, b) => a.binding.boundAt.localeCompare(b.binding.boundAt)
                },
                {
                  title: "在网状态",
                  key: "online",
                  render: (_val, record) => {
                    const online = record.device?.online ?? null;
                    return (
                      <a
                        href={`${appPath(`/devices/${record.binding.sn}`)}?from=${encodeURIComponent(currentUrl)}`}
                        className="binding-online-link"
                        title="查看设备详情"
                      >
                        <OnlineTag value={online} />
                      </a>
                    );
                  }
                }
              ]}
              pagination={
                showBindingPagination(boundDevices.length)
                  ? { pageSize: BIND_TABLE_PAGE_SIZE, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }
                  : false
              }
            />
          </section>
        </div>
      );
    }

    if (searchResult.status === "mode_b") {
      const { sn: searchedSn, bindings: relationList } = searchResult;
      return (
        <section aria-label="绑定关系" className="device-ops-panel device-ops-panel--table binding-relations-panel">
          <div className="device-ops-toolbar">
            <span className="device-ops-toolbar__count">
              设备 <strong>{searchedSn}</strong> 的绑定关系（共 <strong className="device-ops-num">{relationList.length}</strong> 人）
            </span>
          </div>
          <Table
            rowKey={(row) => row.binding.userId}
            dataSource={relationList}
            scroll={{ x: "max-content" }}
            columns={[
              {
                title: "用户 ID",
                dataIndex: ["binding", "userId"],
                key: "userId",
                render: (uId: string) => (
                  <a
                    href={`${appPath("/users/binding")}?user_id=${encodeURIComponent(uId)}&from=${encodeURIComponent(currentUrl)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`${appPath("/users/binding")}?user_id=${encodeURIComponent(uId)}&from=${encodeURIComponent(currentUrl)}`);
                    }}
                  >
                    {uId}
                  </a>
                )
              },
              {
                title: "手机号",
                key: "phone",
                render: (_val, record) => {
                  const userPhone = record.user?.phone;
                  return userPhone ? maskPhone(userPhone) : "—";
                }
              },
              {
                title: "绑定角色",
                dataIndex: ["binding", "role"],
                key: "role",
                render: (role: BindingRole) =>
                  role === "owner" ? (
                    <strong className="binding-role-owner">管理员</strong>
                  ) : (
                    <span className="binding-role-member">成员</span>
                  )
              },
              {
                title: "绑定时间",
                dataIndex: ["binding", "boundAt"],
                key: "boundAt",
                sorter: (a, b) => a.binding.boundAt.localeCompare(b.binding.boundAt)
              },
              {
                title: "账号状态",
                key: "accountStatus",
                render: (_val, record) =>
                  record.user?.accountStatus ? (
                    <AccountStatusTag value={record.user.accountStatus} />
                  ) : (
                    "—"
                  )
              },
              {
                title: "操作",
                key: "actions",
                render: (_val, record) => (
                  <a
                    href={`${appPath("/users/binding")}?user_id=${encodeURIComponent(record.binding.userId)}&from=${encodeURIComponent(currentUrl)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`${appPath("/users/binding")}?user_id=${encodeURIComponent(record.binding.userId)}&from=${encodeURIComponent(currentUrl)}`);
                    }}
                  >
                    查看用户
                  </a>
                )
              }
            ]}
            pagination={
              showBindingPagination(relationList.length)
                ? { pageSize: BIND_TABLE_PAGE_SIZE, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }
                : false
            }
          />
        </section>
      );
    }

    return null;
  };

  // 整模块无权限：直达 URL 落 403 兜底页 + 申请入口（09-29 口径，不掩盖成空态）。
  if (params.get("perm") === "forbidden") {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-title-row">
          <h1 className="device-ops-title">用户与绑定</h1>
        </header>
        <section className="device-ops-panel">
          <Result
            extra={
              <Button onClick={() => message.success("已向管理员提交「用户与绑定」的开通申请，处理结果会通过站内信通知")} type="primary">
                申请权限
              </Button>
            }
            status="403"
            subTitle="「用户与绑定」需要管理员开通（platform:app_user:view）。点击「申请权限」提交申请，审批结果会通过站内信通知；也可以直接联系华南运营中心管理员。"
            title="该功能未对当前账号开放"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="device-ops-stack">
      <header className="device-ops-title-row">
        {returnTo && (
          <div className="binding-back-wrap">
            <a className="device-ops-back" href={returnTo}>
              <ArrowLeftOutlined aria-hidden="true" />
              返回
            </a>
          </div>
        )}
        <h1 className="device-ops-title">用户与绑定</h1>
      </header>

      <section aria-label="检索表单" className="device-ops-panel binding-search-panel">
        <Form layout="inline" className="binding-search-form" onFinish={handleSearch}>
          <Form.Item label="手机号" className="binding-form-item">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入11位手机号"
              maxLength={11}
              allowClear
              disabled={isPhoneDisabled}
              onPressEnter={handleSearch}
            />
          </Form.Item>
          <Form.Item label="用户 ID" className="binding-form-item">
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="请输入用户 ID"
              allowClear
              disabled={isUserIdDisabled}
              onPressEnter={handleSearch}
            />
          </Form.Item>
          <Form.Item label="设备 SN" className="binding-form-item">
            <Input
              value={sn}
              onChange={(e) => setSn(e.target.value)}
              placeholder="请输入设备 SN"
              allowClear
              disabled={isSnDisabled}
              onPressEnter={handleSearch}
            />
          </Form.Item>
          <Form.Item className="binding-form-actions">
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                disabled={isSearchDisabled}
                loading={isQueryLoading}
              >
                查询
              </Button>
              <Button
                onClick={() => {
                  setPhone("");
                  setUserId("");
                  setSn("");
                  setSearchResult({ status: "idle" });
                  setLastQuery(null);
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(0,0,0,0.45)", flexWrap: "wrap" }}>
          <span>示例检索：</span>
          <Button
            size="small"
            type="dashed"
            onClick={() => {
              setUserId("U100014");
              setPhone("");
              setSn("");
              runQuery({ type: "userId", value: "U100014" });
            }}
          >
            典型多设备用户 U100014
          </Button>
          <Button
            size="small"
            type="dashed"
            onClick={() => {
              setPhone("13600008969");
              setUserId("");
              setSn("");
              runQuery({ type: "phone", value: "13600008969" });
            }}
          >
            手机号 13600008969
          </Button>
          <Button
            size="small"
            type="dashed"
            onClick={() => {
              setSn("TS24070115");
              setPhone("");
              setUserId("");
              runQuery({ type: "sn", value: "TS24070115" });
            }}
          >
            设备绑定反查 TS24070115
          </Button>
        </div>
      </section>

      {renderResultArea()}

      <Modal
        open={sensitiveModalOpen}
        title="查看完整手机号"
        width={420}
        onCancel={() => {
          setSensitiveModalOpen(false);
          setAuditReason("");
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setSensitiveModalOpen(false);
              setAuditReason("");
            }}
          >
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            disabled={!auditReason.trim()}
            onClick={handleConfirmReveal}
          >
            确认查看
          </Button>
        ]}
      >
        <div className="binding-audit-dialog">
          <Alert
            type="info"
            showIcon
            description="敏感字段查看将被记入安全审计日志（包含操作人、操作时间及查看原因）。"
            className="binding-audit-alert"
          />
          <Form layout="vertical">
            <Form.Item label="查看原因" required>
              <Input.TextArea
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                placeholder="请输入查看原因（必填，不超过 100 字）"
                maxLength={100}
                showCount
                rows={3}
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
}
