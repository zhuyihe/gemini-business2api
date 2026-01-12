"""
API认证模块
提供API Key验证功能（用于API端点）
管理端点使用Session认证（见core/session_auth.py）
"""
from typing import Optional
from fastapi import HTTPException
from core.api_keys import verify_api_key as verify_dynamic_key, get_api_key_count


def verify_api_key(api_key_value: str, authorization: Optional[str] = None) -> bool:
    """
    验证 API Key

    Args:
        api_key_value: 配置的API Key值（环境变量中的主Key）
        authorization: Authorization Header中的值

    Returns:
        验证通过返回True，否则抛出HTTPException

    支持格式：
    1. Bearer YOUR_API_KEY
    2. YOUR_API_KEY
    
    验证顺序：
    1. 先检查是否匹配环境变量中的主 API_KEY
    2. 再检查是否匹配动态生成的 API Keys
    """
    # 如果未配置主 API_KEY 且没有动态 Key，则跳过验证（公开访问）
    if not api_key_value and get_api_key_count() == 0:
        return True
    
    # 检查 Authorization header
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header"
        )

    # 提取token（支持Bearer格式）
    token = authorization
    if authorization.startswith("Bearer "):
        token = authorization[7:]

    # 1. 检查主 API_KEY（环境变量配置的）
    if api_key_value and token == api_key_value:
        return True
    
    # 2. 检查动态生成的 API Keys
    if verify_dynamic_key(token):
        return True

    # 都不匹配则拒绝
    raise HTTPException(
        status_code=401,
        detail="Invalid API Key"
    )
