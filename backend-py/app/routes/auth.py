"""Port of server/routes/auth.js — public register/login + authed /me."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from ..auth import require_auth
from ..services import auth_service

router = APIRouter(prefix="/api/auth")


@router.post("/register")
async def register(request: Request):
    body = await request.json()
    result = auth_service.register(body.get("email"), body.get("password"))
    return JSONResponse(
        status_code=201,
        content={"success": True, "user": result["user"], "token": result["token"]},
    )


@router.post("/login")
async def login(request: Request):
    body = await request.json()
    result = auth_service.login(body.get("email"), body.get("password"))
    return {"success": True, "user": result["user"], "token": result["token"]}


@router.get("/me")
def me(user=Depends(require_auth)):
    row = auth_service.get_by_id(user["sub"])
    if not row:
        return JSONResponse(status_code=404, content={"success": False, "error": "User not found"})
    return {"success": True, "user": {"id": row["id"], "email": row["email"], "role": row["role"]}}
