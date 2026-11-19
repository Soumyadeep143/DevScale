using UnrealBuildTool;
public class BangaloreLifeSimTarget : TargetRules { public BangaloreLifeSimTarget(TargetInfo Target) : base(Target) { Type = TargetType.Game; DefaultBuildSettings = BuildSettingsVersion.Latest; IncludeOrderVersion = EngineIncludeOrderVersion.Latest; ExtraModuleNames.Add("BangaloreLifeSim"); } }
