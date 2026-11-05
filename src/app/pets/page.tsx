import { renderPetsRoute } from "@/components/pages/pets-route";

export const dynamic = "force-dynamic";

export default async function PetsRoute() {
  return renderPetsRoute();
}
