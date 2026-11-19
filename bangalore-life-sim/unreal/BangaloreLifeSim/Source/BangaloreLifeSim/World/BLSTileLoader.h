// UNVERIFIED (not compiled). Loads the game-tile JSON produced by tools/osm_pipeline/osm_to_game.py
// and exposes the road graph/buildings to editor tools and runtime systems. See docs/ARCHITECTURE.md section 4.
#pragma once
#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "BLSTileLoader.generated.h"

USTRUCT(BlueprintType) struct FBLSRoad { GENERATED_BODY()
  UPROPERTY(BlueprintReadOnly) FString Name; UPROPERTY(BlueprintReadOnly) FString Highway;
  UPROPERTY(BlueprintReadOnly) bool bOneWay = false; UPROPERTY(BlueprintReadOnly) int32 Lanes = 2; UPROPERTY(BlueprintReadOnly) float SpeedKph = 30.f;
  TArray<FVector> Points; /* cm, UE axes: X east, Y south (-north), Z up */ };
USTRUCT(BlueprintType) struct FBLSBuilding { GENERATED_BODY()
  UPROPERTY(BlueprintReadOnly) FString Name; UPROPERTY(BlueprintReadOnly) float HeightCm = 900.f; TArray<FVector2D> Footprint; };

UCLASS(BlueprintType)
class BANGALORELIFESIM_API UBLSTileData : public UObject { GENERATED_BODY()
public:
  UPROPERTY(BlueprintReadOnly) double OriginLat = 0; UPROPERTY(BlueprintReadOnly) double OriginLon = 0; UPROPERTY(BlueprintReadOnly) bool bApproximate = false;
  UPROPERTY(BlueprintReadOnly) TArray<FBLSRoad> Roads; UPROPERTY(BlueprintReadOnly) TArray<FBLSBuilding> Buildings;
  /** Metres in the tile JSON -> centimetres in UE. JSON x=east, y=north  ->  UE X=east, Y=-north. */
  UFUNCTION(BlueprintCallable, Category="BLS") static UBLSTileData* LoadFromFile(const FString& AbsolutePath);
};
