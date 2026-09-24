import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Every scene renders real components only — no hand-written Tailwind here, so
// the classes under test are exactly the ones Tailwind generated for src/.
const scene = new URLSearchParams(window.location.search).get("scene") ?? "menus";

function Menus() {
  return (
    <div className="p-8 space-y-6">
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Меню</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem data-scan="dropdown-item">Обычный пункт</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked data-scan="dropdown-checkbox">
            Отмеченный пункт
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a" data-scan="dropdown-radio">
              Переключатель
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger data-scan="dropdown-subtrigger">
              Вложенное меню
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Вложенный пункт</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <Menubar>
        <MenubarMenu value="file">
          <MenubarTrigger data-scan="menubar-trigger">Файл</MenubarTrigger>
          <MenubarContent>
            <MenubarItem data-scan="menubar-item">Открыть</MenubarItem>
            <MenubarSub open>
              <MenubarSubTrigger data-scan="menubar-subtrigger">Ещё</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>Вложенный</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <Command className="border">
        <CommandList>
          <CommandGroup heading="Группа">
            <CommandItem data-scan="command-item">Выбранный пункт</CommandItem>
            <CommandItem>Второй пункт</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>

      <Select open defaultValue="one">
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Выберите" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one" data-scan="select-item">
            Первый вариант
          </SelectItem>
          <SelectItem value="two">Второй вариант</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function Controls() {
  return (
    <div className="p-8 flex flex-wrap items-center gap-4">
      <Button data-scan="button-default">Кнопка</Button>
      <Button variant="cta" data-scan="button-cta">
        Главное действие
      </Button>
      <Button variant="secondary">Вторичная</Button>
      <Button variant="outline">Контурная</Button>
      <Button variant="ghost">Прозрачная</Button>
      <Button variant="destructive">Удалить</Button>
      <Button variant="toggle">Переключатель</Button>
      <Badge data-scan="badge-default">Значок</Badge>
      <Badge variant="secondary">Вторичный</Badge>
      <Toggle variant="outline" data-scan="toggle-outline">
        Тумблер
      </Toggle>
    </div>
  );
}

function CalendarScene() {
  const from = new Date(2026, 8, 7);
  const to = new Date(2026, 8, 11);
  return (
    <div className="p-8">
      <Calendar
        mode="range"
        selected={{ from, to }}
        defaultMonth={from}
        data-scan="calendar"
      />
    </div>
  );
}

function DialogScene() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Окно</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Крестик закрытия виден только на телефоне.
        </p>
      </DialogContent>
    </Dialog>
  );
}

const scenes: Record<string, () => JSX.Element> = {
  menus: Menus,
  controls: Controls,
  calendar: CalendarScene,
  dialog: DialogScene,
};

const Scene = scenes[scene] ?? Menus;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Scene />
  </StrictMode>,
);
