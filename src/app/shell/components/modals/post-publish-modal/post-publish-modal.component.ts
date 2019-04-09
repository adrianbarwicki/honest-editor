import * as $ from 'jquery';
import { Component, ViewEncapsulation } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { PostService } from '@app/shared/services/post.service';
import { Post } from '@app/shared/interfaces';
import { WalletService, ICurrencyConversion, ICurrencyConversionResponse } from '@app/shared/services/wallet.service';

let bodyHTML = '';
let _bodyHTML = '';

const ridMapFunction = (j: number, el: any) => {
  const $el = $(el);
  if (!$el.hasClass('cl-preview-section')) {
    const children = $el.children();
    if (children.length === 1) {
      bodyHTML += $el.html();
    } else {
      children.map(ridMapFunction);
    }
  } else {
    bodyHTML += $el.html();
  }
};

const stringIncludes = (string: string, find: string) => {
  return string.indexOf(find) !== -1;
};

const syncDomElementsWithOldEditor = (j: number, el: any): any => {
  // remove non dom elements from the result html
  const $el = $(el);
  if (
    stringIncludes(el.nodeName, '#text') ||
    stringIncludes(el.nodeName, '#comment') ||
    stringIncludes(el.nodeName, 'BR')
  ) {
    return;
  }

  _bodyHTML += $el.prop('outerHTML');
};

const getRidOfStackeditWrapper = (body: string) => {
  $(body).map(ridMapFunction);
  $(bodyHTML).map(syncDomElementsWithOldEditor);
  return _bodyHTML;
};

@Component({
  selector: 'app-post-publish-modal',
  templateUrl: './post-publish-modal.component.html',
  styleUrls: ['./post-publish-modal.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class PostPublishModalComponent {
  post: Post;
  paidSectionEnabled: boolean;
  paidSectionCostInUSD: number;
  bchUsdRate: number;
  showPaidSectionCostInUSD = false;
  bodyHTML: string;
  paidSectionLinebreakEnd = 0;
  paidSectionLineBreakTouched = false;

  constructor(
    public activeModal: NgbActiveModal,
    private postService: PostService,
    private walletService: WalletService
  ) {
    const previewWrapper = document.getElementsByClassName('preview__inner-2')[0];
    this.bodyHTML = previewWrapper.innerHTML;

    // remove wrappers on html tags
    this.bodyHTML = getRidOfStackeditWrapper(this.bodyHTML);
    this.paidSectionLinebreakEnd = $(this.bodyHTML).length;

    setTimeout(() => {
      this.paidSectionEnabled = this.post.parentPostId ? false : true;
    });

    if (!this.bchUsdRate) {
      this.walletService.getCurrencyData().subscribe((response: ICurrencyConversionResponse) => {
        this.bchUsdRate = Number(response.data.rates.USD);
        this.showPaidSectionCostInUSD = true;
        setTimeout(() => {
          if (this.post.hasPaidSection) {
            this.setPaidSectionCost('bch');
            this.scrollToLinebreak(undefined, this.post.paidSectionLinebreak);
          }
        });
      });
    }
  }

  public togglePaidSection() {
    if (this.post.hasPaidSection && !this.paidSectionLineBreakTouched) {
      setTimeout(() => {
        this.setPaidSectionCost('bch');
        this.scrollToLinebreak(undefined, 1);
      }, 0);
    }
  }

  public setPaidSectionCost(currency: 'usd' | 'bch') {
    if (!this.showPaidSectionCostInUSD) {
      return;
    }

    let cost;
    if (currency === 'bch') {
      const usd = this.walletService.convertBCHtoUSD(this.post.paidSectionCost, this.bchUsdRate);
      (<HTMLInputElement>document.getElementById('paidSectionCostInUSD')).valueAsNumber = usd;
      this.paidSectionCostInUSD = usd;
    } else if (currency === 'usd') {
      // bug in mozilla or angular itself that ng-model does not update when clicking arrows in input number
      cost = (<HTMLInputElement>document.getElementById('paidSectionCostInUSD')).valueAsNumber || 0;
      const bch = this.walletService.convertUSDtoBCH(cost, this.bchUsdRate);
      (<HTMLInputElement>document.getElementById('paidSectionCostInBCH')).valueAsNumber = bch;
      this.post.paidSectionCost = bch;
    }
  }

  public adjustPaidSectionLinebreak(action: 'increment' | 'decrement') {
    if (action === 'increment') {
      this.post.paidSectionLinebreak += 1;
    } else if (action === 'decrement') {
      this.post.paidSectionLinebreak -= 1;
    }
    this.paidSectionLineBreakTouched = true;
  }

  public switchLinebreak(action: 'increment' | 'decrement') {
    switch (action) {
      case 'increment':
        if (this.post.paidSectionLinebreak < this.paidSectionLinebreakEnd - 1) {
          this.adjustPaidSectionLinebreak(action);
          this.scrollToLinebreak(action);
        }
        break;
      case 'decrement':
        if (this.post.paidSectionLinebreak > 0) {
          this.adjustPaidSectionLinebreak(action);
          this.scrollToLinebreak(action);
        }
        break;
      default:
        break;
    }
  }

  public scrollToLinebreak(action: 'increment' | 'decrement', toLinebreak?: number) {
    const $container = $('.post-paid-section-preview-paid-section');
    const $scrollTo = $container.children().eq(this.post.paidSectionLinebreak - 1);

    if (toLinebreak === null || toLinebreak === undefined) {
      $container.animate({
        scrollTop: $scrollTo.offset().top - $container.offset().top + $container.scrollTop()
      });
      let $sibling;

      if (action === 'increment') {
        $sibling = $scrollTo.prev();
      } else if (action === 'decrement') {
        $sibling = $scrollTo.next();
      }
      if ($sibling) {
        $sibling.removeClass('bb-2 bb-dashed bb-red');
      }
      $scrollTo.addClass('bb-2 bb-dashed bb-red');
    } else {
      // timeout is required
      setTimeout(() => {
        const $scrollTo = $container.children().eq(toLinebreak - 1);
        $container.scrollTop($scrollTo.offset().top - $container.offset().top + $container.scrollTop());
        $scrollTo.addClass('bb-2 bb-dashed bb-red');
      }, 0);
    }
  }

  public onAddRemovePaste() {
    this.post.hashtags = this.transformTags(this.post.userPostHashtags);
    this.postService
      .savePostProperty(this.post, 'hashtags')
      .toPromise()
      .then(() => console.log('added'));
  }

  public publish() {
    this.activeModal.close({
      hashtags: this.transformTags(this.post.userPostHashtags),
      hasPaidSection: this.post.hasPaidSection,
      paidSectionLinebreak: this.post.paidSectionLinebreak,
      paidSectionCost: this.post.paidSectionCost
    });
  }

  private transformTags(tags: any[]) {
    return tags.map(h => h.hashtag).join(',');
  }
}
