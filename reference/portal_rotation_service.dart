import 'package:flutter/foundation.dart';

@immutable
class PortalEventEntry {
  const PortalEventEntry({
    required this.eventName,
    required this.gccName,
    required this.bossName,
    required this.goldCardName,
    required this.iconAssetPath,
    required this.wikiPageUrl,
  });

  final String eventName;
  final String gccName;
  final String bossName;
  final String goldCardName;
  final String iconAssetPath;
  final String wikiPageUrl;
}

@immutable
class PortalRotationSnapshot {
  const PortalRotationSnapshot({
    required this.isPortalOpen,
    required this.activeEvent,
    required this.nextEvent,
    required this.remaining,
  }) : assert(
         (isPortalOpen && activeEvent != null) ||
             (!isPortalOpen && activeEvent == null),
         'When portal is open activeEvent must be set, otherwise null.',
       );

  final bool isPortalOpen;
  final PortalEventEntry? activeEvent;
  final PortalEventEntry nextEvent;
  final Duration remaining;
}

@immutable
class PortalEventWindow {
  const PortalEventWindow({
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

/// Computes the current standard portal event from a cyclic schedule.
class PortalRotationService {
  const PortalRotationService();

  static const Duration _eventDuration = Duration(days: 10);
  static const Duration _portalClosedDuration = Duration(days: 4);
  static const Duration _cycleDuration = Duration(days: 14);
  static const Duration _fullRotationDuration = Duration(days: 140);
  static final DateTime _anchorTimestampUtc = DateTime.utc(2026, 4, 21);
  static const int _anchorCurrentEventIndex = 9; // Monster Bash (Ella)
  static const Duration _anchorRemaining = Duration(days: 3);

  static const List<PortalEventEntry> events = <PortalEventEntry>[
    PortalEventEntry(
      eventName: 'Huntress',
      gccName: 'Bear',
      bossName: 'Anna',
      goldCardName: 'Anna',
      iconAssetPath: 'assets/icons/portal/Huntress_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Huntress_Event',
    ),
    PortalEventEntry(
      eventName: 'Mad Scientist',
      gccName: 'Science',
      bossName: 'Albert',
      goldCardName: 'Albert',
      iconAssetPath: 'assets/icons/portal/Mad_Scientist_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Mad_Scientist_Event',
    ),
    PortalEventEntry(
      eventName: 'Time Traveler',
      gccName: 'Time',
      bossName: 'Mr. Pimm',
      goldCardName: 'Mr. Pimm',
      iconAssetPath: 'assets/icons/portal/Time_Traveler_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Time_Traveler_Event',
    ),
    PortalEventEntry(
      eventName: 'Crazed AI',
      gccName: 'Energy',
      bossName: 'Lucy',
      goldCardName: 'Lucy',
      iconAssetPath: 'assets/icons/portal/Crazed_AI_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Crazed_AI_Event',
    ),
    PortalEventEntry(
      eventName: 'Cyclone',
      gccName: 'Wind',
      bossName: 'Leopold',
      goldCardName: 'Leopold',
      iconAssetPath: 'assets/icons/portal/Cyclone_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Cyclone_Event',
    ),
    PortalEventEntry(
      eventName: 'Super Villain',
      gccName: 'Villain',
      bossName: 'Vera',
      goldCardName: 'Vera',
      iconAssetPath: 'assets/icons/portal/Super_Villain_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Super_Villain_Event',
    ),
    PortalEventEntry(
      eventName: 'Copper Chef',
      gccName: 'Food',
      bossName: 'Francois',
      goldCardName: 'Francois',
      iconAssetPath: 'assets/icons/portal/Copper_Chef_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Copper_Chef_Event',
    ),
    PortalEventEntry(
      eventName: 'Science Fair',
      gccName: 'Life',
      bossName: 'Miles',
      goldCardName: 'Miles',
      iconAssetPath: 'assets/icons/portal/Science_Fair_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Science_Fair_Event',
    ),
    PortalEventEntry(
      eventName: 'Invasion',
      gccName: 'Space',
      bossName: 'Xanthar',
      goldCardName: 'Xanthar',
      iconAssetPath: 'assets/icons/portal/Invasion_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Invasion_Event',
    ),
    PortalEventEntry(
      eventName: 'Monster Bash',
      gccName: 'Monster',
      bossName: 'Ella',
      goldCardName: 'Ella',
      iconAssetPath: 'assets/icons/portal/Monster_Bash_Icon.png',
      wikiPageUrl: 'https://lil-alchemist.fandom.com/wiki/Monster_Bash_Event',
    ),
  ];

  PortalRotationSnapshot snapshotAt({DateTime? nowUtc}) {
    final DateTime now = nowUtc?.toUtc() ?? DateTime.now().toUtc();
    final DateTime anchorEventEndUtc = _anchorTimestampUtc.add(
      _anchorRemaining,
    );
    final DateTime anchorEventStartUtc = anchorEventEndUtc.subtract(
      _eventDuration,
    );
    final Duration deltaSinceAnchorStart = now.difference(anchorEventStartUtc);

    final int elapsedCycles =
        deltaSinceAnchorStart.inMicroseconds ~/ _cycleDuration.inMicroseconds;
    final int currentIndex = _positiveModulo(
      _anchorCurrentEventIndex + elapsedCycles,
      events.length,
    );
    final int nextIndex = _positiveModulo(currentIndex + 1, events.length);

    final Duration elapsedIntoCycle =
        deltaSinceAnchorStart -
        Duration(microseconds: elapsedCycles * _cycleDuration.inMicroseconds);

    if (elapsedIntoCycle < _eventDuration) {
      final Duration remaining = _eventDuration - elapsedIntoCycle;
      return PortalRotationSnapshot(
        isPortalOpen: true,
        activeEvent: events[currentIndex],
        nextEvent: events[nextIndex],
        remaining: remaining,
      );
    }

    final Duration elapsedIntoClosedWindow = elapsedIntoCycle - _eventDuration;
    final Duration remainingClosed =
        _portalClosedDuration - elapsedIntoClosedWindow;

    return PortalRotationSnapshot(
      isPortalOpen: false,
      activeEvent: null,
      nextEvent: events[nextIndex],
      remaining: remainingClosed,
    );
  }

  PortalEventWindow nextWindowForEvent(
    PortalEventEntry event, {
    DateTime? nowUtc,
  }) {
    final DateTime now = nowUtc?.toUtc() ?? DateTime.now().toUtc();
    final int eventIndex = events.indexOf(event);
    assert(eventIndex >= 0, 'Unknown event passed to nextWindowForEvent.');

    final DateTime anchorEventEndUtc = _anchorTimestampUtc.add(
      _anchorRemaining,
    );
    final DateTime anchorEventStartUtc = anchorEventEndUtc.subtract(
      _eventDuration,
    );
    final int deltaIndex = eventIndex - _anchorCurrentEventIndex;
    final DateTime baseStartUtc = anchorEventStartUtc.add(
      Duration(days: deltaIndex * _cycleDuration.inDays),
    );

    final int elapsedFullRotations =
        now.difference(baseStartUtc).inMicroseconds ~/
        _fullRotationDuration.inMicroseconds;
    DateTime startUtc = baseStartUtc.add(
      Duration(days: elapsedFullRotations * _fullRotationDuration.inDays),
    );
    DateTime endUtc = startUtc.add(_eventDuration);

    while (!now.isBefore(endUtc) && now != startUtc) {
      startUtc = startUtc.add(_fullRotationDuration);
      endUtc = startUtc.add(_eventDuration);
    }

    if (startUtc.isAfter(now)) {
      return PortalEventWindow(
        startUtc: startUtc,
        endUtc: endUtc,
        isActiveNow: false,
        timeUntilStart: startUtc.difference(now),
        timeUntilEnd: null,
      );
    }

    return PortalEventWindow(
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
