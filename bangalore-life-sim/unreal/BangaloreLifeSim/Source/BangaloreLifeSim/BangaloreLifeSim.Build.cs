// UNVERIFIED: authored without an Unreal toolchain available. Expect to fix includes/API names on first compile.
using UnrealBuildTool;
public class BangaloreLifeSim : ModuleRules
{
    public BangaloreLifeSim(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput", "ChaosVehicles", "Json", "JsonUtilities", "MassEntity", "MassCommon", "MassMovement", "ZoneGraph" });
        PrivateDependencyModuleNames.AddRange(new[] { "Slate", "SlateCore" });
    }
}
