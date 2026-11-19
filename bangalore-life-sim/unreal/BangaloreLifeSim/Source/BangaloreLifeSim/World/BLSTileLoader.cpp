// UNVERIFIED (not compiled).
#include "BLSTileLoader.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"

static FVector ToUE(double X, double Y, double Z = 0) { return FVector(X * 100.0, -Y * 100.0, Z * 100.0); }

UBLSTileData* UBLSTileData::LoadFromFile(const FString& Path)
{
  FString Text; if (!FFileHelper::LoadFileToString(Text, *Path)) { UE_LOG(LogTemp, Error, TEXT("BLS: cannot read %s"), *Path); return nullptr; }
  TSharedPtr<FJsonObject> Root; auto Reader = TJsonReaderFactory<>::Create(Text);
  if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) { UE_LOG(LogTemp, Error, TEXT("BLS: bad JSON %s"), *Path); return nullptr; }
  UBLSTileData* T = NewObject<UBLSTileData>();
  const TSharedPtr<FJsonObject> Meta = Root->GetObjectField(TEXT("meta"));
  T->bApproximate = Meta->GetBoolField(TEXT("approximate"));
  T->OriginLat = Meta->GetObjectField(TEXT("origin"))->GetNumberField(TEXT("lat")); T->OriginLon = Meta->GetObjectField(TEXT("origin"))->GetNumberField(TEXT("lon"));
  for (const TSharedPtr<FJsonValue>& V : Root->GetArrayField(TEXT("roads"))) {
    const TSharedPtr<FJsonObject> O = V->AsObject(); FBLSRoad R;
    R.Name = O->GetStringField(TEXT("name")); R.Highway = O->GetStringField(TEXT("hw")); R.bOneWay = O->GetBoolField(TEXT("oneway"));
    R.Lanes = O->GetIntegerField(TEXT("lanes")); R.SpeedKph = O->GetNumberField(TEXT("speed"));
    for (const TSharedPtr<FJsonValue>& P : O->GetArrayField(TEXT("pts"))) { const auto& A = P->AsArray(); R.Points.Add(ToUE(A[0]->AsNumber(), A[1]->AsNumber())); }
    T->Roads.Add(MoveTemp(R));
  }
  for (const TSharedPtr<FJsonValue>& V : Root->GetArrayField(TEXT("buildings"))) {
    const TSharedPtr<FJsonObject> O = V->AsObject(); FBLSBuilding B; B.Name = O->GetStringField(TEXT("name")); B.HeightCm = O->GetNumberField(TEXT("h")) * 100.0;
    for (const TSharedPtr<FJsonValue>& P : O->GetArrayField(TEXT("pts"))) { const auto& A = P->AsArray(); B.Footprint.Add(FVector2D(A[0]->AsNumber() * 100.0, -A[1]->AsNumber() * 100.0)); }
    T->Buildings.Add(MoveTemp(B));
  }
  return T;
}
