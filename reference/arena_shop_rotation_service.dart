import 'package:flutter/foundation.dart';

@immutable
class ArenaAbilityTier {
  const ArenaAbilityTier({
    required this.title,
    required this.effect,
    required this.cost,
  });

  final String title;
  final String effect;
  final int cost;
}

@immutable
class ArenaAbilityEntry {
  const ArenaAbilityEntry({
    required this.name,
    required this.alchemistType,
    required this.iconAssetPath,
    required this.shortDescription,
    required this.tiers,
  });

  final String name;
  final String alchemistType;
  final String iconAssetPath;
  final String shortDescription;
  final List<ArenaAbilityTier> tiers;
}

@immutable
class ArenaAbilityWindow {
  const ArenaAbilityWindow({
    required this.startUtc,
    required this.endUtc,
    required this.isActiveNow,
    required this.timeUntilStart,
    required this.timeUntilEnd,
  });

  final DateTime startUtc;
  final DateTime endUtc;
  final bool isActiveNow;
  final Duration timeUntilStart;
  final Duration? timeUntilEnd;
}

@immutable
class ArenaShopSnapshot {
  const ArenaShopSnapshot({
    required this.currentAbility,
    required this.timeUntilRotation,
  });

  final ArenaAbilityEntry currentAbility;
  final Duration timeUntilRotation;
}

class ArenaShopRotationService {
  const ArenaShopRotationService();

  static const Duration _slotDuration = Duration(days: 7);
  static const Duration _fullRotationDuration = Duration(days: 63);

  static final DateTime _anchorTimestampUtc = DateTime.utc(2026, 4, 21);
  static const int _anchorCurrentIndex = 2; // Master Healer
  static const Duration _anchorRemaining = Duration(hours: 8);

  static const List<ArenaAbilityEntry> abilities = <ArenaAbilityEntry>[
    ArenaAbilityEntry(
      name: 'Tiebreaker',
      alchemistType: 'Elementalist',
      iconAssetPath: 'assets/icons/arena/TieBreaker.png',
      shortDescription: 'Ties count as victories',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Only Tier',
          effect: 'Win match in event of tie',
          cost: 400,
        ),
      ],
    ),
    ArenaAbilityEntry(
      name: 'Combo Master',
      alchemistType: 'Enchanter',
      iconAssetPath: 'assets/icons/arena/ComboMaster.png',
      shortDescription: 'Start battle with orbs filled up',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Only Tier',
          effect: '1 Orb filled at match start',
          cost: 1000,
        ),
      ],
    ),
    ArenaAbilityEntry(
      name: 'Master Healer',
      alchemistType: 'Healer',
      iconAssetPath: 'assets/icons/arena/MasterHealer.png',
      shortDescription: 'Increase your starting health',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Tier 1',
          effect: '4 HP added at start',
          cost: 850,
        ),
        ArenaAbilityTier(
          title: 'Tier 2',
          effect: '7 HP added at start',
          cost: 1065,
        ),
        ArenaAbilityTier(
          title: 'Tier 3',
          effect: '10 HP added at start',
          cost: 1280,
        ),
      ],
    ),
    ArenaAbilityEntry(
      name: 'Master Elementalist',
      alchemistType: 'Elementalist',
      iconAssetPath: 'assets/icons/arena/MasterElementalist.png',
      shortDescription: 'Decrease opponent starting health',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Tier 1',
          effect: '4 HP removed from opponent at start',
          cost: 850,
        ),
        ArenaAbilityTier(
          title: 'Tier 2',
          effect: '7 HP removed from opponent at start',
          cost: 1065,
        ),
        ArenaAbilityTier(
          title: 'Tier 3',
          effect: '10 HP removed from opponent at start',
          cost: 1280,
        ),
      ],
    ),
    ArenaAbilityEntry(
      name: 'Master Enchanter',
      alchemistType: 'Enchanter',
      iconAssetPath: 'assets/icons/arena/MasterEnchanter.png',
      shortDescription: 'Increase your max orb count',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Only Tier',
          effect: '1 Orb added to max orb count',
          cost: 700,
        ),
      ],
    ),
    ArenaAbilityEntry(
      name: 'Greed',
      alchemistType: 'Healer',
      iconAssetPath: 'assets/icons/arena/GreedAlchemist.png',
      shortDescription: 'Earn more coins at battle end',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Tier 1',
          effect: '20% more coins (1.2x regular coins)',
          cost: 550,
        ),
        ArenaAbilityTier(
          title: 'Tier 2',
          effect: '40% more coins (1.4x regular coins)',
          cost: 690,
        ),
        ArenaAbilityTier(
          title: 'Tier 3',
          effect: '60% more coins (1.6x regular coins)',
          cost: 830,
        ),
      ],
    ),
    ArenaAbilityEntry(
      name: 'Quick Learner',
      alchemistType: 'Elementalist',
      iconAssetPath: 'assets/icons/arena/QuickLearner.png',
      shortDescription: 'Earn more experience for each battle',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Tier 1',
          effect: '20% more XP (1.2x regular XP)',
          cost: 550,
        ),
        ArenaAbilityTier(
          title: 'Tier 2',
          effect: '40% more XP (1.4x regular XP)',
          cost: 690,
        ),
        ArenaAbilityTier(
          title: 'Tier 3',
          effect: '60% more XP (1.6x regular XP)',
          cost: 830,
        ),
      ],
    ),
    ArenaAbilityEntry(
      name: 'Lucky',
      alchemistType: 'Enchanter',
      iconAssetPath: 'assets/icons/arena/Lucky.png',
      shortDescription: 'Increase chance to win a card from battle',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Tier 1',
          effect: '10% increase (1.1x regular chances)',
          cost: 550,
        ),
        ArenaAbilityTier(
          title: 'Tier 2',
          effect: '20% increase (1.2x regular chances)',
          cost: 690,
        ),
        ArenaAbilityTier(
          title: 'Tier 3',
          effect: '30% increase (1.3x regular chances)',
          cost: 830,
        ),
      ],
    ),
    ArenaAbilityEntry(
      name: 'Lobotomizer',
      alchemistType: 'Healer',
      iconAssetPath: 'assets/icons/arena/Lobotomizer.png',
      shortDescription: 'Remove cards from opponent deck',
      tiers: <ArenaAbilityTier>[
        ArenaAbilityTier(
          title: 'Tier 1',
          effect: '5 cards removed from opponent deck',
          cost: 700,
        ),
        ArenaAbilityTier(
          title: 'Tier 2',
          effect: '10 cards removed from opponent deck',
          cost: 875,
        ),
        ArenaAbilityTier(
          title: 'Tier 3',
          effect: '15 cards removed from opponent deck',
          cost: 1075,
        ),
      ],
    ),
  ];

  ArenaShopSnapshot snapshotAt({DateTime? nowUtc}) {
    final DateTime now = nowUtc?.toUtc() ?? DateTime.now().toUtc();
    final DateTime anchorEndUtc = _anchorTimestampUtc.add(_anchorRemaining);
    final DateTime anchorStartUtc = anchorEndUtc.subtract(_slotDuration);
    final Duration deltaSinceAnchor = now.difference(anchorStartUtc);

    final int elapsedSlots =
        deltaSinceAnchor.inMicroseconds ~/ _slotDuration.inMicroseconds;
    final int currentIndex = _positiveModulo(
      _anchorCurrentIndex + elapsedSlots,
      abilities.length,
    );
    final Duration elapsedInCurrentSlot =
        deltaSinceAnchor -
        Duration(microseconds: elapsedSlots * _slotDuration.inMicroseconds);
    final Duration remaining = _slotDuration - elapsedInCurrentSlot;

    return ArenaShopSnapshot(
      currentAbility: abilities[currentIndex],
      timeUntilRotation: remaining,
    );
  }

  ArenaAbilityWindow nextWindowForAbility(
    ArenaAbilityEntry ability, {
    DateTime? nowUtc,
  }) {
    final DateTime now = nowUtc?.toUtc() ?? DateTime.now().toUtc();
    final int abilityIndex = abilities.indexOf(ability);
    assert(abilityIndex >= 0, 'Unknown arena ability passed.');

    final DateTime anchorEndUtc = _anchorTimestampUtc.add(_anchorRemaining);
    final DateTime anchorStartUtc = anchorEndUtc.subtract(_slotDuration);
    final int deltaIndex = abilityIndex - _anchorCurrentIndex;
    final DateTime baseStartUtc = anchorStartUtc.add(
      Duration(days: deltaIndex * _slotDuration.inDays),
    );

    final int elapsedFullRotations =
        now.difference(baseStartUtc).inMicroseconds ~/
        _fullRotationDuration.inMicroseconds;
    DateTime startUtc = baseStartUtc.add(
      Duration(days: elapsedFullRotations * _fullRotationDuration.inDays),
    );
    DateTime endUtc = startUtc.add(_slotDuration);

    while (!now.isBefore(endUtc) && now != startUtc) {
      startUtc = startUtc.add(_fullRotationDuration);
      endUtc = startUtc.add(_slotDuration);
    }

    if (startUtc.isAfter(now)) {
      return ArenaAbilityWindow(
        startUtc: startUtc,
        endUtc: endUtc,
        isActiveNow: false,
        timeUntilStart: startUtc.difference(now),
        timeUntilEnd: null,
      );
    }

    return ArenaAbilityWindow(
      startUtc: startUtc,
      endUtc: endUtc,
      isActiveNow: true,
      timeUntilStart: Duration.zero,
      timeUntilEnd: endUtc.difference(now),
    );
  }

  static int _positiveModulo(int value, int mod) {
    final int remainder = value % mod;
    if (remainder >= 0) {
      return remainder;
    }
    return remainder + mod;
  }
}
