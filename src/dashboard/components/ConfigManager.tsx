import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WebsitesTab from "./config/WebsitesTab";
import CitiesTab from "./config/CitiesTab";
import EditConfigTab from "./config/EditConfigTab";
import KeywordsTab from "./config/KeywordsTab";
import CompetitorsTab from "./config/CompetitorsTab";

// ── Main component ────────────────────────────────────────────────────
export default function ConfigManager() {

  return (
    <Tabs defaultValue="websites" orientation="horizontal">
      <TabsList className="mb-4">
        <TabsTrigger value="websites">Websites</TabsTrigger>
        <TabsTrigger value="keywords">Keywords</TabsTrigger>
        <TabsTrigger value="competitors">Competitors</TabsTrigger>
        <TabsTrigger value="cities-config">Cities</TabsTrigger>
      </TabsList>

      <TabsContent value="websites">
        <WebsitesTab />
      </TabsContent>
      <TabsContent value="cities-config">
        <CitiesTab />
      </TabsContent>
      <TabsContent value="keywords">
        <KeywordsTab />
      </TabsContent>
      <TabsContent value="competitors">
        <CompetitorsTab />
      </TabsContent>

      <TabsContent value="edit-config">
        <EditConfigTab />
      </TabsContent>
    </Tabs>
  );
}
