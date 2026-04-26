"use client"

import { LogOut, Monitor, Moon, Settings, Sun, User as UserIcon } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

function initialsOf(displayName: string | null, email: string): string {
  const source = (displayName ?? email).trim()
  if (!source) return "?"
  const parts = source.split(/\s+/)
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase()
  }
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase()
}

export function UserMenu() {
  const { user, profile } = useAuth()
  const { theme, setTheme } = useTheme()

  const email = profile?.email ?? user.email ?? ""
  const displayName = profile?.display_name ?? null

  const onLogout = async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) {
        toast.error("Logout failed", { description: error.message })
        return
      }
      window.location.href = "/login"
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      toast.error("Logout failed", { description: message })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Open user menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs font-medium">
              {initialsOf(displayName, email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium">
            {displayName ?? email.split("@")[0] ?? "Account"}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" aria-hidden />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/tenant" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? (
              <Moon className="mr-2 h-4 w-4" aria-hidden />
            ) : theme === "light" ? (
              <Sun className="mr-2 h-4 w-4" aria-hidden />
            ) : (
              <Monitor className="mr-2 h-4 w-4" aria-hidden />
            )}
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme ?? "system"}
              onValueChange={(value) => setTheme(value)}
            >
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 h-4 w-4" aria-hidden />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 h-4 w-4" aria-hidden />
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="mr-2 h-4 w-4" aria-hidden />
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
