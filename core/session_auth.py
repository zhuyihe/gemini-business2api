"""
Session认证模块
提供基于Session的登录认证功能
"""
import secrets
from functools import wraps
from typing import Optional
from fastapi import HTTPException, Request, Response
from fastapi.responses import RedirectResponse


def generate_session_secret() -> str:
    """生成随机的session密钥"""
    return secrets.token_hex(32)


def is_logged_in(request: Request) -> bool:
    """检查用户是否已登录"""
    return request.session.get("authenticated", False)


def login_user(request: Request):
    """标记用户为已登录状态"""
    request.session["authenticated"] = True


def logout_user(request: Request):
    """清除用户登录状态"""
    request.session.clear()


def require_login(redirect_to_login: bool = True, json_response: bool = None):
    """
    要求用户登录的装饰器

    Args:
        redirect_to_login: 未登录时是否重定向到登录页面（默认True）
                          False时返回404错误
        json_response: 未登录时是否返回JSON错误（默认None，自动检测）
                      如果请求Accept头包含application/json或路径以/api-keys开头，返回JSON
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, request: Request, **kwargs):
            if not is_logged_in(request):
                # 检测是否应该返回JSON响应
                should_return_json = json_response
                if should_return_json is None:
                    # 自动检测：检查Accept头或路径
                    accept = request.headers.get("accept", "")
                    path = request.url.path
                    should_return_json = (
                        "application/json" in accept or
                        "/api-keys" in path or
                        path.endswith("/accounts") or
                        path.endswith("/settings") or
                        path.endswith("/health")
                    )
                
                if should_return_json:
                    # 返回JSON错误响应
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "未登录或会话已过期，请重新登录"}
                    )
                elif redirect_to_login:
                    # 构建登录页面URL（支持可选的PATH_PREFIX）
                    # 从请求路径中提取PATH_PREFIX（如果有）
                    path = request.url.path

                    # 动态导入main模块获取PATH_PREFIX（避免循环依赖）
                    import main
                    prefix = main.PATH_PREFIX

                    if prefix:
                        login_url = f"/{prefix}/login"
                    else:
                        login_url = "/login"

                    return RedirectResponse(url=login_url, status_code=302)
                else:
                    # 返回404假装端点不存在
                    raise HTTPException(404, "Not Found")

            return await func(*args, request=request, **kwargs)
        return wrapper
    return decorator
