"""
API Key 管理模块
支持生成、删除、验证多个 API Key，以及详细用量统计

数据持久化策略：
1. HF Spaces Pro: 使用 /data 目录持久化
2. HF Spaces 免费版: 使用环境变量 API_KEYS_CONFIG 持久化（JSON格式）
3. 本地开发: 使用 ./data 目录

环境变量格式 (API_KEYS_CONFIG):
[{"key": "sk-xxx", "note": "测试", "created_at": "2025-01-12 10:00:00"}]

用量统计在免费版中不持久化（重启后清零），但 Keys 本身会保留
"""
import json
import os
import secrets
import string
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from threading import Lock

logger = logging.getLogger("gemini")

# 数据文件路径
if os.path.exists("/data"):
    # HF Spaces Pro - 有持久化存储
    API_KEYS_FILE = "/data/api_keys.json"
    API_USAGE_FILE = "/data/api_usage.json"
    STORAGE_MODE = "file"
else:
    API_KEYS_FILE = "./data/api_keys.json"
    API_USAGE_FILE = "./data/api_usage.json"
    # 检查是否有环境变量配置（HF 免费版）
    if os.getenv("API_KEYS_CONFIG"):
        STORAGE_MODE = "env"  # 使用环境变量
    else:
        STORAGE_MODE = "file"  # 本地文件

# 确保目录存在
os.makedirs(os.path.dirname(API_KEYS_FILE) if os.path.dirname(API_KEYS_FILE) else ".", exist_ok=True)

# 线程锁
_lock = Lock()
_usage_lock = Lock()

# 内存缓存
_api_keys: Dict[str, dict] = {}
_api_usage: Dict[str, dict] = {}  # {key: {total, today, by_model, by_hour, recent_requests}}

# 标记是否有未保存的更改（用于环境变量模式提示）
_has_unsaved_changes = False


def _generate_key(prefix: str = "sk-", length: int = 32) -> str:
    """生成随机 API Key"""
    chars = string.ascii_letters + string.digits
    random_part = ''.join(secrets.choice(chars) for _ in range(length))
    return f"{prefix}{random_part}"


def generate_preview_key() -> str:
    """生成预览用的 Key（不保存，仅用于前端显示）"""
    return _generate_key()


def _load_keys() -> Dict[str, dict]:
    """从文件或环境变量加载 API Keys"""
    global _api_keys
    
    # 优先从环境变量加载（HF 免费版）
    env_config = os.getenv("API_KEYS_CONFIG")
    if env_config:
        try:
            keys_list = json.loads(env_config)
            _api_keys = {k["key"]: k for k in keys_list if "key" in k}
            logger.info(f"[API_KEYS] 从环境变量加载 {len(_api_keys)} 个 Key")
            return _api_keys
        except Exception as e:
            logger.error(f"[API_KEYS] 环境变量解析失败: {e}")
    
    # 从文件加载
    try:
        if os.path.exists(API_KEYS_FILE):
            with open(API_KEYS_FILE, 'r', encoding='utf-8') as f:
                _api_keys = json.load(f)
        else:
            _api_keys = {}
    except Exception:
        _api_keys = {}
    return _api_keys


def _load_usage() -> Dict[str, dict]:
    """从文件加载用量统计"""
    global _api_usage
    try:
        if os.path.exists(API_USAGE_FILE):
            with open(API_USAGE_FILE, 'r', encoding='utf-8') as f:
                _api_usage = json.load(f)
        else:
            _api_usage = {}
    except Exception:
        _api_usage = {}
    return _api_usage


def _save_keys():
    """保存 API Keys 到文件"""
    global _has_unsaved_changes
    
    # 如果是环境变量模式，标记有未保存的更改
    if STORAGE_MODE == "env":
        _has_unsaved_changes = True
        # 仍然保存到文件（作为备份，但重启后会丢失）
    
    try:
        with open(API_KEYS_FILE, 'w', encoding='utf-8') as f:
            json.dump(_api_keys, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"[API_KEYS] 保存失败: {e}")


def _save_usage():
    """保存用量统计到文件"""
    try:
        with open(API_USAGE_FILE, 'w', encoding='utf-8') as f:
            json.dump(_api_usage, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"[API_USAGE] 保存失败: {e}")


def _get_today_str() -> str:
    """获取今天的日期字符串"""
    return datetime.now().strftime("%Y-%m-%d")


def _get_hour_str() -> str:
    """获取当前小时字符串"""
    return datetime.now().strftime("%Y-%m-%d %H:00")


def _init_usage_for_key(key: str):
    """初始化某个 Key 的用量统计结构"""
    if key not in _api_usage:
        _api_usage[key] = {
            "total": 0,
            "by_date": {},      # {"2025-01-12": 100}
            "by_model": {},     # {"gemini-2.5-flash": 50}
            "by_hour": {},      # {"2025-01-12 14:00": 10}
            "recent_requests": []  # 最近100条请求记录
        }


def init_api_keys():
    """初始化加载 API Keys 和用量统计"""
    with _lock:
        _load_keys()
        logger.info(f"[API_KEYS] 已加载 {len(_api_keys)} 个 API Key (存储模式: {STORAGE_MODE})")
    with _usage_lock:
        _load_usage()
        logger.info(f"[API_USAGE] 已加载用量统计")


def create_api_key(note: str = "", created_by: str = "admin", custom_key: str = None) -> dict:
    """
    创建新的 API Key
    custom_key: 可选，使用指定的 Key（如预生成的 Key）
    """
    with _lock:
        if custom_key:
            # 使用自定义 Key
            if custom_key in _api_keys:
                raise ValueError("该 Key 已存在")
            key = custom_key
        else:
            # 自动生成
            key = _generate_key()
            while key in _api_keys:
                key = _generate_key()
        
        key_data = {
            "key": key,
            "note": note,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "created_by": created_by,
            "last_used": None
        }
        _api_keys[key] = key_data
        _save_keys()
    
    # 初始化用量统计
    with _usage_lock:
        _init_usage_for_key(key)
        _save_usage()
    
    return key_data


def delete_api_key(key: str) -> bool:
    """删除 API Key"""
    with _lock:
        if key in _api_keys:
            del _api_keys[key]
            _save_keys()
            # 同时删除用量统计
            with _usage_lock:
                if key in _api_usage:
                    del _api_usage[key]
                    _save_usage()
            return True
        return False


def verify_api_key(key: str) -> bool:
    """验证 API Key 是否有效（不记录用量，用量在 record_usage 中记录）"""
    if not key:
        return False
    with _lock:
        return key in _api_keys


def record_usage(key: str, model: str = "unknown", success: bool = True):
    """
    记录 API Key 的使用情况
    在请求完成后调用此函数记录用量
    """
    if not key:
        return
    
    now = datetime.now()
    today = _get_today_str()
    hour = _get_hour_str()
    
    with _lock:
        if key in _api_keys:
            _api_keys[key]["last_used"] = now.strftime("%Y-%m-%d %H:%M:%S")
            _save_keys()
    
    with _usage_lock:
        _init_usage_for_key(key)
        usage = _api_usage[key]
        
        # 总计数
        usage["total"] += 1
        
        # 按日期统计
        usage["by_date"][today] = usage["by_date"].get(today, 0) + 1
        
        # 按模型统计
        usage["by_model"][model] = usage["by_model"].get(model, 0) + 1
        
        # 按小时统计（保留最近48小时）
        usage["by_hour"][hour] = usage["by_hour"].get(hour, 0) + 1
        # 清理48小时前的数据
        cutoff = (now - timedelta(hours=48)).strftime("%Y-%m-%d %H:00")
        usage["by_hour"] = {k: v for k, v in usage["by_hour"].items() if k >= cutoff}
        
        # 最近请求记录（保留最近100条）
        usage["recent_requests"].append({
            "time": now.strftime("%Y-%m-%d %H:%M:%S"),
            "model": model,
            "success": success
        })
        if len(usage["recent_requests"]) > 100:
            usage["recent_requests"] = usage["recent_requests"][-100:]
        
        # 清理30天前的日期统计
        cutoff_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        usage["by_date"] = {k: v for k, v in usage["by_date"].items() if k >= cutoff_date}
        
        _save_usage()


def get_all_api_keys() -> List[dict]:
    """获取所有 API Keys（含用量统计）"""
    today = _get_today_str()
    
    with _lock:
        keys_copy = dict(_api_keys)
    
    with _usage_lock:
        usage_copy = dict(_api_usage)
    
    result = []
    for key, data in keys_copy.items():
        masked_key = key[:8] + "****" + key[-4:] if len(key) > 12 else key
        usage = usage_copy.get(key, {})
        
        result.append({
            "key": key,
            "masked_key": masked_key,
            "note": data.get("note", ""),
            "created_at": data.get("created_at", ""),
            "last_used": data.get("last_used"),
            "total_requests": usage.get("total", 0),
            "today_requests": usage.get("by_date", {}).get(today, 0),
            "by_model": usage.get("by_model", {})
        })
    
    result.sort(key=lambda x: x["created_at"], reverse=True)
    return result


def get_api_key_usage(key: str) -> Optional[dict]:
    """获取单个 API Key 的详细用量"""
    with _usage_lock:
        if key not in _api_usage:
            return None
        
        usage = _api_usage[key]
        today = _get_today_str()
        
        # 计算最近7天的趋势
        daily_trend = []
        for i in range(6, -1, -1):
            date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            daily_trend.append({
                "date": date,
                "count": usage.get("by_date", {}).get(date, 0)
            })
        
        # 计算最近24小时的趋势
        hourly_trend = []
        for i in range(23, -1, -1):
            hour = (datetime.now() - timedelta(hours=i)).strftime("%Y-%m-%d %H:00")
            hourly_trend.append({
                "hour": hour,
                "count": usage.get("by_hour", {}).get(hour, 0)
            })
        
        return {
            "total": usage.get("total", 0),
            "today": usage.get("by_date", {}).get(today, 0),
            "by_model": usage.get("by_model", {}),
            "daily_trend": daily_trend,
            "hourly_trend": hourly_trend,
            "recent_requests": usage.get("recent_requests", [])[-20:]  # 最近20条
        }


def get_api_key_count() -> int:
    """获取 API Key 数量"""
    with _lock:
        return len(_api_keys)


def get_total_usage_stats() -> dict:
    """获取所有 Key 的汇总统计"""
    today = _get_today_str()
    
    with _usage_lock:
        total_requests = 0
        today_requests = 0
        model_stats = {}
        
        for key, usage in _api_usage.items():
            total_requests += usage.get("total", 0)
            today_requests += usage.get("by_date", {}).get(today, 0)
            
            for model, count in usage.get("by_model", {}).items():
                model_stats[model] = model_stats.get(model, 0) + count
        
        return {
            "total_keys": len(_api_keys),
            "total_requests": total_requests,
            "today_requests": today_requests,
            "by_model": model_stats
        }


def export_keys_config() -> str:
    """
    导出当前所有 Keys 为 JSON 字符串
    用于复制到 HF Spaces 的环境变量 API_KEYS_CONFIG
    """
    with _lock:
        keys_list = list(_api_keys.values())
        return json.dumps(keys_list, ensure_ascii=False)


def get_storage_info() -> dict:
    """获取存储模式信息"""
    return {
        "mode": STORAGE_MODE,
        "has_unsaved_changes": _has_unsaved_changes,
        "keys_file": API_KEYS_FILE,
        "usage_file": API_USAGE_FILE,
        "hint": "env" if STORAGE_MODE == "env" else None
    }
