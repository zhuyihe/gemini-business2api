let currentConfig = null;

            // 复制到剪贴板函数
            function copyToClipboard(text, button) {
                navigator.clipboard.writeText(text).then(() => {
                    // 显示复制成功状态
                    const originalText = button.innerHTML;
                    button.innerHTML = '✓';
                    button.classList.add('copied');

                    // 2秒后恢复
                    setTimeout(() => {
                        button.innerHTML = originalText;
                        button.classList.remove('copied');
                    }, 2000);
                }).catch(err => {
                    console.error('复制失败:', err);
                    alert('复制失败，请手动复制');
                });
            }

            // 标签页切换函数
            function switchTab(tabName) {
                // 隐藏所有标签页内容
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                // 移除所有标签按钮的active状态
                document.querySelectorAll('.tab-button').forEach(button => {
                    button.classList.remove('active');
                });

                // 显示选中的标签页
                document.getElementById('tab-' + tabName).classList.add('active');
                // 激活对应的按钮
                event.target.classList.add('active');
            }

            // 统一的页面刷新函数（避免缓存）
            function refreshPage() {
                window.location.reload();
            }

            // 统一的错误处理函数
            async function handleApiResponse(response) {
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMsg;
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMsg = errorJson.detail || errorJson.message || errorText;
                    } catch {
                        errorMsg = errorText;
                    }
                    throw new Error(`HTTP $${response.status}: $${errorMsg}`);
                }
                return await response.json();
            }

            async function showEditConfig() {
                const config = await fetch(`/${window.ADMIN_PATH}/accounts-config`).then(r => r.json());
                currentConfig = config.accounts;
                const json = JSON.stringify(config.accounts, null, 2);
                document.getElementById('jsonEditor').value = json;
                document.getElementById('jsonError').classList.remove('show');
                document.getElementById('jsonModal').classList.add('show');

                // 实时验证 JSON
                document.getElementById('jsonEditor').addEventListener('input', validateJSON);
            }

            function validateJSON() {
                const editor = document.getElementById('jsonEditor');
                const errorDiv = document.getElementById('jsonError');
                try {
                    JSON.parse(editor.value);
                    errorDiv.classList.remove('show');
                    errorDiv.textContent = '';
                    return true;
                } catch (e) {
                    errorDiv.classList.add('show');
                    errorDiv.textContent = '❌ JSON 格式错误: ' + e.message;
                    return false;
                }
            }

            function closeModal() {
                document.getElementById('jsonModal').classList.remove('show');
                document.getElementById('jsonEditor').removeEventListener('input', validateJSON);
            }

            async function saveConfig() {
                if (!validateJSON()) {
                    alert('JSON 格式错误，请修正后再保存');
                    return;
                }

                const newJson = document.getElementById('jsonEditor').value;
                const originalJson = JSON.stringify(currentConfig, null, 2);

                if (newJson === originalJson) {
                    closeModal();
                    return;
                }

                try {
                    const data = JSON.parse(newJson);
                    const response = await fetch(`/${window.ADMIN_PATH}/accounts-config`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(data)
                    });

                    await handleApiResponse(response);
                    closeModal();
                    refreshPage();
                } catch (error) {
                    console.error('保存失败:', error);
                    alert('更新失败: ' + error.message);
                }
            }

            async function deleteAccount(accountId) {
                if (!confirm(`确定删除账户 $${accountId}？`)) return;

                try {
                    const response = await fetch(`/${window.ADMIN_PATH}/accounts/${accountId}`, {
                        method: 'DELETE'
                    });

                    await handleApiResponse(response);
                    refreshPage();
                } catch (error) {
                    console.error('删除失败:', error);
                    alert('删除失败: ' + error.message);
                }
            }

            async function disableAccount(accountId) {
                try {
                    const response = await fetch(`/${window.ADMIN_PATH}/accounts/${accountId}/disable`, {
                        method: 'PUT'
                    });

                    await handleApiResponse(response);
                    refreshPage();
                } catch (error) {
                    console.error('禁用失败:', error);
                    alert('禁用失败: ' + error.message);
                }
            }

            async function enableAccount(accountId) {
                try {
                    const response = await fetch(`/${window.ADMIN_PATH}/accounts/${accountId}/enable`, {
                        method: 'PUT'
                    });

                    await handleApiResponse(response);
                    refreshPage();
                } catch (error) {
                    console.error('启用失败:', error);
                    alert('启用失败: ' + error.message);
                }
            }

            // 批量上传相关函数
            async function handleFileUpload(event) {
                const files = event.target.files;
                if (!files.length) return;

                let newAccounts = [];
                for (const file of files) {
                    try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        if (Array.isArray(data)) {
                            newAccounts.push(...data);
                        } else {
                            newAccounts.push(data);
                        }
                    } catch (e) {
                        alert(`文件 $${file.name} 解析失败: $${e.message}`);
                        event.target.value = '';
                        return;
                    }
                }

                if (!newAccounts.length) {
                    alert('未找到有效账户数据');
                    event.target.value = '';
                    return;
                }

                try {
                    // 获取现有配置
                    const configResp = await fetch(`/${window.ADMIN_PATH}/accounts-config`);
                    const configData = await handleApiResponse(configResp);
                    const existing = configData.accounts || [];

                    // 构建ID到索引的映射
                    const idToIndex = new Map();
                    existing.forEach((acc, idx) => {
                        if (acc.id) idToIndex.set(acc.id, idx);
                    });

                    // 合并：相同ID覆盖，新ID追加
                    let added = 0;
                    let updated = 0;
                    for (const acc of newAccounts) {
                        if (!acc.secure_c_ses || !acc.csesidx || !acc.config_id) continue;
                        const accId = acc.id || `account_${existing.length + added + 1}`;
                        acc.id = accId;

                        if (idToIndex.has(accId)) {
                            // 覆盖已存在的账户
                            existing[idToIndex.get(accId)] = acc;
                            updated++;
                        } else {
                            // 追加新账户
                            existing.push(acc);
                            idToIndex.set(accId, existing.length - 1);
                            added++;
                        }
                    }

                    if (added === 0 && updated === 0) {
                        alert('没有有效账户可导入');
                        event.target.value = '';
                        return;
                    }

                    // 保存合并后的配置
                    const response = await fetch(`/${window.ADMIN_PATH}/accounts-config`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(existing)
                    });

                    await handleApiResponse(response);
                    event.target.value = '';
                    refreshPage();
                } catch (error) {
                    console.error('导入失败:', error);
                    alert('导入失败: ' + error.message);
                    event.target.value = '';
                }
            }

            // 点击模态框外部关闭
            document.getElementById('jsonModal').addEventListener('click', function(e) {
                if (e.target === this) {
                    closeModal();
                }
            });

            // ========== 系统设置相关函数 ==========
            async function loadSettings() {
                try {
                    const response = await fetch(`/${window.ADMIN_PATH}/settings`);
                    const settings = await handleApiResponse(response);

                    // 基础配置
                    document.getElementById('setting-api-key').value = settings.basic?.api_key || '';
                    document.getElementById('setting-base-url').value = settings.basic?.base_url || '';
                    document.getElementById('setting-proxy').value = settings.basic?.proxy || '';

                    // 图片生成配置
                    document.getElementById('setting-image-enabled').checked = settings.image_generation?.enabled ?? true;
                    const supportedModels = settings.image_generation?.supported_models || [];
                    document.querySelectorAll('#setting-image-models input[type="checkbox"]').forEach(cb => {
                        cb.checked = supportedModels.includes(cb.value);
                    });

                    // 重试策略配置
                    document.getElementById('setting-max-new-session').value = settings.retry?.max_new_session_tries || 5;
                    document.getElementById('setting-max-retries').value = settings.retry?.max_request_retries || 3;
                    document.getElementById('setting-max-switch').value = settings.retry?.max_account_switch_tries || 5;
                    document.getElementById('setting-failure-threshold').value = settings.retry?.account_failure_threshold || 3;
                    document.getElementById('setting-cooldown').value = settings.retry?.rate_limit_cooldown_seconds || 600;
                    document.getElementById('setting-cache-ttl').value = settings.retry?.session_cache_ttl_seconds || 3600;

                    // 公开展示配置
                    document.getElementById('setting-logo-url').value = settings.public_display?.logo_url || '';
                    document.getElementById('setting-chat-url').value = settings.public_display?.chat_url || '';
                    document.getElementById('setting-session-hours').value = settings.session?.expire_hours || 24;
                } catch (error) {
                    console.error('加载设置失败:', error);
                    alert('加载设置失败: ' + error.message);
                }
            }

            async function saveSettings() {
                try {
                    // 收集图片生成支持的模型
                    const supportedModels = [];
                    document.querySelectorAll('#setting-image-models input[type="checkbox"]:checked').forEach(cb => {
                        supportedModels.push(cb.value);
                    });

                    const settings = {
                        basic: {
                            api_key: document.getElementById('setting-api-key').value,
                            base_url: document.getElementById('setting-base-url').value,
                            proxy: document.getElementById('setting-proxy').value
                        },
                        image_generation: {
                            enabled: document.getElementById('setting-image-enabled').checked,
                            supported_models: supportedModels
                        },
                        retry: {
                            max_new_session_tries: parseInt(document.getElementById('setting-max-new-session').value) || 5,
                            max_request_retries: parseInt(document.getElementById('setting-max-retries').value) || 3,
                            max_account_switch_tries: parseInt(document.getElementById('setting-max-switch').value) || 5,
                            account_failure_threshold: parseInt(document.getElementById('setting-failure-threshold').value) || 3,
                            rate_limit_cooldown_seconds: parseInt(document.getElementById('setting-cooldown').value) || 600,
                            session_cache_ttl_seconds: parseInt(document.getElementById('setting-cache-ttl').value) || 3600
                        },
                        public_display: {
                            logo_url: document.getElementById('setting-logo-url').value,
                            chat_url: document.getElementById('setting-chat-url').value
                        },
                        session: {
                            expire_hours: parseInt(document.getElementById('setting-session-hours').value) || 24
                        }
                    };

                    const response = await fetch(`/${window.ADMIN_PATH}/settings`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(settings)
                    });

                    await handleApiResponse(response);

                    // 直接刷新页面，不显示弹窗
                    window.location.reload();
                } catch (error) {
                    console.error('保存设置失败:', error);
                    alert('保存设置失败: ' + error.message);
                }
            }

            // 页面加载时自动加载设置
            document.addEventListener('DOMContentLoaded', function() {
                loadSettings();
            });


            // ========== API Key 管理相关函数 ==========

            async function loadApiKeys() {
                try {
                    // 并行加载 Keys 列表和汇总统计
                    const [keysResponse, statsResponse] = await Promise.all([
                        fetch(`/${window.ADMIN_PATH}/api-keys`),
                        fetch(`/${window.ADMIN_PATH}/api-keys-stats`)
                    ]);
                    
                    const keysData = await handleApiResponse(keysResponse);
                    const statsData = await handleApiResponse(statsResponse);
                    
                    renderApiKeysSummary(statsData.data);
                    renderApiKeysList(keysData.keys);
                } catch (error) {
                    console.error('加载 API Keys 失败:', error);
                    document.getElementById('api-keys-list').innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #ff3b30;">
                            加载失败: ${error.message}
                        </div>
                    `;
                }
            }

            function renderApiKeysSummary(stats) {
                const container = document.getElementById('api-keys-summary');
                if (!container) return;
                
                container.innerHTML = `
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 16px; border-radius: 12px; color: white;">
                        <div style="font-size: 28px; font-weight: 700;">${stats.total_keys || 0}</div>
                        <div style="font-size: 12px; opacity: 0.9;">API Keys</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 16px; border-radius: 12px; color: white;">
                        <div style="font-size: 28px; font-weight: 700;">${stats.today_requests || 0}</div>
                        <div style="font-size: 12px; opacity: 0.9;">今日请求</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 16px; border-radius: 12px; color: white;">
                        <div style="font-size: 28px; font-weight: 700;">${stats.total_requests || 0}</div>
                        <div style="font-size: 12px; opacity: 0.9;">总请求数</div>
                    </div>
                `;
            }

            function renderApiKeysList(keys) {
                const container = document.getElementById('api-keys-list');
                
                if (!keys || keys.length === 0) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #86868b;">
                            <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
                            <div>暂无 API Key</div>
                            <div style="font-size: 12px; margin-top: 8px;">点击上方"生成新 Key"按钮创建</div>
                        </div>
                    `;
                    return;
                }

                let html = `
                    <table class="ep-table" style="width: 100%;">
                        <thead>
                            <tr style="background: #f5f5f7;">
                                <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b6b6b;">API Key</th>
                                <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b6b6b;">备注</th>
                                <th style="padding: 12px; text-align: center; font-size: 12px; color: #6b6b6b;">今日用量</th>
                                <th style="padding: 12px; text-align: center; font-size: 12px; color: #6b6b6b;">总用量</th>
                                <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b6b6b;">模型分布</th>
                                <th style="padding: 12px; text-align: left; font-size: 12px; color: #6b6b6b;">最后使用</th>
                                <th style="padding: 12px; text-align: center; font-size: 12px; color: #6b6b6b;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                for (const key of keys) {
                    // 生成模型分布标签
                    let modelTags = '';
                    if (key.by_model && Object.keys(key.by_model).length > 0) {
                        const models = Object.entries(key.by_model).sort((a, b) => b[1] - a[1]).slice(0, 3);
                        modelTags = models.map(([model, count]) => 
                            `<span style="background: #e3f2fd; color: #1565c0; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 4px;">${model.replace('gemini-', '')}:${count}</span>`
                        ).join('');
                    } else {
                        modelTags = '<span style="color: #86868b; font-size: 11px;">-</span>';
                    }

                    html += `
                        <tr>
                            <td style="padding: 12px;">
                                <code style="font-size: 12px; background: #f0f0f2; padding: 4px 8px; border-radius: 4px;">${key.masked_key}</code>
                            </td>
                            <td style="padding: 12px; color: #1d1d1f; font-size: 13px;">${key.note || '<span style="color: #86868b;">-</span>'}</td>
                            <td style="padding: 12px; text-align: center;">
                                <span style="background: #fff3e0; color: #e65100; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600;">${key.today_requests || 0}</span>
                            </td>
                            <td style="padding: 12px; text-align: center;">
                                <span style="background: #e8f5e9; color: #2e7d32; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600;">${key.total_requests || 0}</span>
                            </td>
                            <td style="padding: 12px;">${modelTags}</td>
                            <td style="padding: 12px; color: #6b6b6b; font-size: 11px;">${key.last_used || '<span style="color: #86868b;">从未</span>'}</td>
                            <td style="padding: 12px; text-align: center;">
                                <button class="btn" style="padding: 4px 10px; font-size: 11px; margin-right: 4px;" onclick="showKeyDetail('${key.key}')">详情</button>
                                <button class="btn" style="padding: 4px 10px; font-size: 11px; background: #ff3b30; color: white;" onclick="deleteApiKey('${key.key}')">删除</button>
                            </td>
                        </tr>
                    `;
                }

                html += '</tbody></table>';
                container.innerHTML = html;
            }

            let preGeneratedKey = '';

            async function showCreateKeyModal() {
                document.getElementById('new-key-note').value = '';
                // 预生成一个 Key
                await regenerateKey();
                document.getElementById('createKeyModal').classList.add('show');
            }

            async function regenerateKey() {
                try {
                    const response = await fetch(`/${window.ADMIN_PATH}/api-keys/generate-preview`);
                    const result = await handleApiResponse(response);
                    preGeneratedKey = result.key;
                    document.getElementById('pre-generated-key').value = preGeneratedKey;
                } catch (error) {
                    console.error('生成 Key 失败:', error);
                    // 如果后端失败，前端生成一个临时的
                    preGeneratedKey = 'sk-' + Array.from({length: 32}, () => 
                        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
                    ).join('');
                    document.getElementById('pre-generated-key').value = preGeneratedKey;
                }
            }

            function copyPreGeneratedKey() {
                const key = document.getElementById('pre-generated-key').value;
                navigator.clipboard.writeText(key).then(() => {
                    alert('已复制到剪贴板！');
                }).catch(err => {
                    alert('复制失败，请手动复制');
                });
            }

            function closeCreateKeyModal() {
                document.getElementById('createKeyModal').classList.remove('show');
                preGeneratedKey = '';
            }

            async function createApiKey() {
                const note = document.getElementById('new-key-note').value.trim();
                const key = document.getElementById('pre-generated-key').value;
                
                if (!key) {
                    alert('请先生成 Key');
                    return;
                }
                
                try {
                    const response = await fetch(`/${window.ADMIN_PATH}/api-keys`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ note: note, key: key })
                    });

                    const result = await handleApiResponse(response);
                    closeCreateKeyModal();
                    
                    // 直接刷新列表，Key 已经在创建前复制了
                    alert('✅ API Key 创建成功！');
                    loadApiKeys();
                } catch (error) {
                    console.error('创建 API Key 失败:', error);
                    alert('创建失败: ' + error.message);
                }
            }

            function closeShowKeyModal() {
                document.getElementById('showKeyModal').classList.remove('show');
            }

            function copyNewKey() {
                const key = document.getElementById('new-key-display').textContent;
                navigator.clipboard.writeText(key).then(() => {
                    alert('已复制到剪贴板！');
                }).catch(err => {
                    console.error('复制失败:', err);
                    alert('复制失败，请手动复制');
                });
            }

            async function deleteApiKey(key) {
                if (!confirm('确定删除这个 API Key？删除后使用该 Key 的用户将无法访问。')) return;

                try {
                    const response = await fetch(`/${window.ADMIN_PATH}/api-keys/${encodeURIComponent(key)}`, {
                        method: 'DELETE'
                    });

                    await handleApiResponse(response);
                    loadApiKeys();
                } catch (error) {
                    console.error('删除 API Key 失败:', error);
                    alert('删除失败: ' + error.message);
                }
            }

            async function showKeyDetail(key) {
                try {
                    const response = await fetch(`/${window.ADMIN_PATH}/api-keys/${encodeURIComponent(key)}/usage`);
                    const result = await handleApiResponse(response);
                    const data = result.data;
                    
                    // 生成7天趋势图（简单柱状图）
                    let trendHtml = '<div style="display: flex; align-items: flex-end; gap: 4px; height: 60px;">';
                    const maxCount = Math.max(...data.daily_trend.map(d => d.count), 1);
                    for (const day of data.daily_trend) {
                        const height = Math.max((day.count / maxCount) * 50, 2);
                        const date = day.date.slice(5); // MM-DD
                        trendHtml += `
                            <div style="flex: 1; text-align: center;">
                                <div style="background: #0071e3; height: ${height}px; border-radius: 2px; margin-bottom: 4px;"></div>
                                <div style="font-size: 9px; color: #86868b;">${date}</div>
                                <div style="font-size: 10px; color: #1d1d1f;">${day.count}</div>
                            </div>
                        `;
                    }
                    trendHtml += '</div>';

                    // 生成模型分布
                    let modelHtml = '';
                    if (data.by_model && Object.keys(data.by_model).length > 0) {
                        const total = Object.values(data.by_model).reduce((a, b) => a + b, 0);
                        modelHtml = Object.entries(data.by_model)
                            .sort((a, b) => b[1] - a[1])
                            .map(([model, count]) => {
                                const pct = ((count / total) * 100).toFixed(1);
                                return `<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f0f0f2;">
                                    <span style="font-size: 12px;">${model}</span>
                                    <span style="font-size: 12px; color: #0071e3;">${count} (${pct}%)</span>
                                </div>`;
                            }).join('');
                    } else {
                        modelHtml = '<div style="color: #86868b; font-size: 12px;">暂无数据</div>';
                    }

                    // 生成最近请求记录
                    let recentHtml = '';
                    if (data.recent_requests && data.recent_requests.length > 0) {
                        recentHtml = data.recent_requests.slice().reverse().map(req => `
                            <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f0f0f2; font-size: 11px;">
                                <span style="color: #6b6b6b;">${req.time}</span>
                                <span>${req.model}</span>
                                <span style="color: ${req.success ? '#2e7d32' : '#ff3b30'};">${req.success ? '✓' : '✗'}</span>
                            </div>
                        `).join('');
                    } else {
                        recentHtml = '<div style="color: #86868b; font-size: 12px;">暂无记录</div>';
                    }

                    const content = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <div style="font-weight: 600; margin-bottom: 12px;">📊 用量统计</div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                                    <div style="background: #f5f5f7; padding: 12px; border-radius: 8px; text-align: center;">
                                        <div style="font-size: 24px; font-weight: 600; color: #e65100;">${data.today}</div>
                                        <div style="font-size: 11px; color: #6b6b6b;">今日请求</div>
                                    </div>
                                    <div style="background: #f5f5f7; padding: 12px; border-radius: 8px; text-align: center;">
                                        <div style="font-size: 24px; font-weight: 600; color: #2e7d32;">${data.total}</div>
                                        <div style="font-size: 11px; color: #6b6b6b;">总请求数</div>
                                    </div>
                                </div>
                                <div style="font-weight: 600; margin-bottom: 8px;">📈 最近7天趋势</div>
                                ${trendHtml}
                            </div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 12px;">🤖 模型分布</div>
                                <div style="max-height: 120px; overflow-y: auto; margin-bottom: 16px;">${modelHtml}</div>
                                <div style="font-weight: 600; margin-bottom: 8px;">🕐 最近请求</div>
                                <div style="max-height: 150px; overflow-y: auto;">${recentHtml}</div>
                            </div>
                        </div>
                    `;

                    document.getElementById('keyDetailContent').innerHTML = content;
                    document.getElementById('keyDetailModal').classList.add('show');
                } catch (error) {
                    console.error('获取详情失败:', error);
                    alert('获取详情失败: ' + error.message);
                }
            }

            function closeKeyDetailModal() {
                document.getElementById('keyDetailModal').classList.remove('show');
            }

            // 点击模态框外部关闭
            document.getElementById('createKeyModal')?.addEventListener('click', function(e) {
                if (e.target === this) closeCreateKeyModal();
            });
            document.getElementById('showKeyModal')?.addEventListener('click', function(e) {
                if (e.target === this) closeShowKeyModal();
            });
            document.getElementById('keyDetailModal')?.addEventListener('click', function(e) {
                if (e.target === this) closeKeyDetailModal();
            });

            // 切换到 API Keys 标签时加载数据
            const originalSwitchTab = switchTab;
            switchTab = function(tabName) {
                originalSwitchTab.call(this, tabName);
                if (tabName === 'apikeys') {
                    loadApiKeys();
                }
            };
