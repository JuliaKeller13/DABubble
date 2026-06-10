'use strict';

customElements.define('compodoc-menu', class extends HTMLElement {
    constructor() {
        super();
        this.isNormalMode = this.getAttribute('mode') === 'normal';
    }

    connectedCallback() {
        this.render(this.isNormalMode);
    }

    render(isNormalMode) {
        let tp = lithtml.html(`
        <nav>
            <ul class="list">
                <li class="title">
                    <a href="index.html" data-type="index-link">dabubble documentation</a>
                </li>

                <li class="divider"></li>
                ${ isNormalMode ? `<div id="book-search-input" role="search"><input type="text" placeholder="Type to search"></div>` : '' }
                <li class="chapter">
                    <a data-type="chapter-link" href="index.html"><span class="icon ion-ios-home"></span>Getting started</a>
                    <ul class="links">
                                <li class="link">
                                    <a href="overview.html" data-type="chapter-link">
                                        <span class="icon ion-ios-keypad"></span>Overview
                                    </a>
                                </li>

                            <li class="link">
                                <a href="index.html" data-type="chapter-link">
                                    <span class="icon ion-ios-paper"></span>
                                        README
                                </a>
                            </li>
                                <li class="link">
                                    <a href="dependencies.html" data-type="chapter-link">
                                        <span class="icon ion-ios-list"></span>Dependencies
                                    </a>
                                </li>
                                <li class="link">
                                    <a href="properties.html" data-type="chapter-link">
                                        <span class="icon ion-ios-apps"></span>Properties
                                    </a>
                                </li>

                    </ul>
                </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#components-links"' :
                            'data-bs-target="#xs-components-links"' }>
                            <span class="icon ion-md-cog"></span>
                            <span>Components</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="components-links"' : 'id="xs-components-links"' }>
                            <li class="link">
                                <a href="components/App.html" data-type="entity-link" >App</a>
                            </li>
                            <li class="link">
                                <a href="components/ChatAreaComponent.html" data-type="entity-link" >ChatAreaComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/ChooseAvatar.html" data-type="entity-link" >ChooseAvatar</a>
                            </li>
                            <li class="link">
                                <a href="components/DatenschutzComponent.html" data-type="entity-link" >DatenschutzComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/dialogAddMemberComponent.html" data-type="entity-link" >dialogAddMemberComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/DialogChannelDetailsComponent.html" data-type="entity-link" >DialogChannelDetailsComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/DialogChannelMembersComponent.html" data-type="entity-link" >DialogChannelMembersComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/dialogCreateChannelComponent.html" data-type="entity-link" >dialogCreateChannelComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/DialogProfileComponent.html" data-type="entity-link" >DialogProfileComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/DialogProfileOverlayComponent.html" data-type="entity-link" >DialogProfileOverlayComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/EmojiPickerHostComponent.html" data-type="entity-link" >EmojiPickerHostComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/EmojiPickerPopupComponent.html" data-type="entity-link" >EmojiPickerPopupComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/FooterComponent.html" data-type="entity-link" >FooterComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/ForgotPassword.html" data-type="entity-link" >ForgotPassword</a>
                            </li>
                            <li class="link">
                                <a href="components/HeaderComponent.html" data-type="entity-link" >HeaderComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/ImpressumComponent.html" data-type="entity-link" >ImpressumComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/IntroComponent.html" data-type="entity-link" >IntroComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/LoginComponent.html" data-type="entity-link" >LoginComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/MainComponent.html" data-type="entity-link" >MainComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/MessageComponent.html" data-type="entity-link" >MessageComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/MessageInputComponent.html" data-type="entity-link" >MessageInputComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/PasswordReset.html" data-type="entity-link" >PasswordReset</a>
                            </li>
                            <li class="link">
                                <a href="components/ProfileMenuComponent.html" data-type="entity-link" >ProfileMenuComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SearchBarComponent.html" data-type="entity-link" >SearchBarComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/SidebarComponent.html" data-type="entity-link" >SidebarComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/Signup.html" data-type="entity-link" >Signup</a>
                            </li>
                            <li class="link">
                                <a href="components/Signup-1.html" data-type="entity-link" >Signup</a>
                            </li>
                            <li class="link">
                                <a href="components/ThreadViewComponent.html" data-type="entity-link" >ThreadViewComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/ToastComponent.html" data-type="entity-link" >ToastComponent</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#classes-links"' :
                            'data-bs-target="#xs-classes-links"' }>
                            <span class="icon ion-ios-paper"></span>
                            <span>Classes</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="classes-links"' : 'id="xs-classes-links"' }>
                            <li class="link">
                                <a href="classes/MessageInputPopupHelper.html" data-type="entity-link" >MessageInputPopupHelper</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#injectables-links"' :
                                'data-bs-target="#xs-injectables-links"' }>
                                <span class="icon ion-md-arrow-round-down"></span>
                                <span>Injectables</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="injectables-links"' : 'id="xs-injectables-links"' }>
                                <li class="link">
                                    <a href="injectables/AuthRedirectToastService.html" data-type="entity-link" >AuthRedirectToastService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/authService.html" data-type="entity-link" >authService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/avatarService.html" data-type="entity-link" >avatarService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/channelService.html" data-type="entity-link" >channelService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/DirectMessageService.html" data-type="entity-link" >DirectMessageService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/EmojiPickerOverlayService.html" data-type="entity-link" >EmojiPickerOverlayService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/EmojiRecentService.html" data-type="entity-link" >EmojiRecentService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/MessageEncodingService.html" data-type="entity-link" >MessageEncodingService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/messageService.html" data-type="entity-link" >messageService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/MessageSubscriptionService.html" data-type="entity-link" >MessageSubscriptionService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PresenceService.html" data-type="entity-link" >PresenceService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ProfileDialogService.html" data-type="entity-link" >ProfileDialogService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/SidebarDataService.html" data-type="entity-link" >SidebarDataService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/SignupStateService.html" data-type="entity-link" >SignupStateService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/supabaseService.html" data-type="entity-link" >supabaseService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ThreadService.html" data-type="entity-link" >ThreadService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/ToastService.html" data-type="entity-link" >ToastService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/userService.html" data-type="entity-link" >userService</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#interfaces-links"' :
                            'data-bs-target="#xs-interfaces-links"' }>
                            <span class="icon ion-md-information-circle-outline"></span>
                            <span>Interfaces</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? ' id="interfaces-links"' : 'id="xs-interfaces-links"' }>
                            <li class="link">
                                <a href="interfaces/Channel.html" data-type="entity-link" >Channel</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ChannelMember.html" data-type="entity-link" >ChannelMember</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ChannelMember-1.html" data-type="entity-link" >ChannelMember</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/DateGroup.html" data-type="entity-link" >DateGroup</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/EmojiClickEvent.html" data-type="entity-link" >EmojiClickEvent</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/EmojiPickerOpenConfig.html" data-type="entity-link" >EmojiPickerOpenConfig</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/EmojiPickerState.html" data-type="entity-link" >EmojiPickerState</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Message.html" data-type="entity-link" >Message</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/MessageInputPart.html" data-type="entity-link" >MessageInputPart</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/MessageTextPart.html" data-type="entity-link" >MessageTextPart</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/MessageToken.html" data-type="entity-link" >MessageToken</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PopupChannel.html" data-type="entity-link" >PopupChannel</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PopupUser.html" data-type="entity-link" >PopupUser</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ReactionListItem.html" data-type="entity-link" >ReactionListItem</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/RecentEmojiEntry.html" data-type="entity-link" >RecentEmojiEntry</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/SidebarData.html" data-type="entity-link" >SidebarData</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/User.html" data-type="entity-link" >User</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#miscellaneous-links"'
                            : 'data-bs-target="#xs-miscellaneous-links"' }>
                            <span class="icon ion-ios-cube"></span>
                            <span>Miscellaneous</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="miscellaneous-links"' : 'id="xs-miscellaneous-links"' }>
                            <li class="link">
                                <a href="miscellaneous/functions.html" data-type="entity-link">Functions</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/typealiases.html" data-type="entity-link">Type aliases</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/variables.html" data-type="entity-link">Variables</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <a data-type="chapter-link" href="routes.html"><span class="icon ion-ios-git-branch"></span>Routes</a>
                        </li>
                    <li class="chapter">
                        <a data-type="chapter-link" href="coverage.html"><span class="icon ion-ios-stats"></span>Documentation coverage</a>
                    </li>
                    <li class="divider"></li>
                    <li class="copyright">
                        Documentation generated using <a href="https://compodoc.app/" target="_blank" rel="noopener noreferrer">
                            <img data-src="images/compodoc-vectorise.png" class="img-responsive" data-type="compodoc-logo">
                        </a>
                    </li>
            </ul>
        </nav>
        `);
        this.innerHTML = tp.strings;
    }
});