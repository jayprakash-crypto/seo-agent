import { useContext } from "react";
import { useRouter } from "next/navigation";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Menu } from "lucide-react";

import { UserContext } from "@/providers/users.provider";

interface User {
  created_at: string;
  email: string;
  id: string;
  name: string;
  updated_at: string;
}

function PageHeader() {
  const router = useRouter();
  const user = useContext(UserContext);

  function handleSignOut() {
    document.cookie = "seo-token=; path=/; max-age=0";
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto hidden sm:flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <span className="font-semibold tracking-tight">SEO Agent</span>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm text-muted-foreground">
            Operator Dashboard
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{user?.name}</span>
          <Button size="sm" variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>

      {/* Small screen Nav */}
      <div className="flex sm:hidden px-2 py-2 justify-between items-center">
        <span className="font-semibold tracking-tight">SEO Agent</span>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="icon" />}
          >
            <Menu />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{user?.name}</DropdownMenuLabel>
              <Separator />
              <DropdownMenuItem>Sign out</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default PageHeader;
